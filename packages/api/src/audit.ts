/**
 * HMAC-chained admin audit log.
 *
 * Each entry is signed with a key derived from SECRET_ENCRYPTION_KEY via HKDF
 * (info="admin-audit", 32 bytes) so the audit log uses its own independent key
 * without needing a separate env var.
 *
 * The hash field of each row is:
 *   HMAC-SHA256(key, prevHash + "|" + timestamp + "|" + userId + "|" + action + "|" + (targetId ?? "") + "|" + (detail ?? ""))
 *
 * prevHash is the hash field of the immediately preceding row (ordered by id),
 * or "" for the very first entry. This binds every entry to the one before it;
 * inserting, deleting, or reordering rows breaks the chain.
 */

import { createHmac, hkdfSync } from "crypto";

import { asc, desc } from "@homarr/db";
import { adminAudit } from "@homarr/db/schema";
import { env } from "@homarr/common/env";

import type { createTRPCContext } from "./trpc";

type Db = ReturnType<typeof createTRPCContext>["db"];

// Derive a 32-byte HMAC key from the site-wide encryption key.
// Cached after first call; the key never changes within a process.
let _auditKey: Buffer | null = null;
const getAuditKey = (): Buffer => {
  if (!_auditKey) {
    _auditKey = Buffer.from(
      hkdfSync("sha256", Buffer.from(env.SECRET_ENCRYPTION_KEY, "hex"), "", "admin-audit", 32),
    );
  }
  return _auditKey;
};

/** Produce the HMAC for a single audit entry. */
const computeHash = (prevHash: string, timestamp: Date, userId: string, action: string, targetId: string, detail: string): string => {
  const payload = [prevHash, timestamp.toISOString(), userId, action, targetId, detail].join("|");
  return createHmac("sha256", getAuditKey()).update(payload).digest("hex");
};

export interface WriteAuditParams {
  userId: string;
  userEmail: string;
  action: string;
  targetId?: string | null;
  detail?: Record<string, unknown> | null;
}

/**
 * Append one entry to the admin audit log.
 *
 * Reads the most-recent row's hash to form the chain link, then inserts the
 * new row. Intentionally fire-and-forget from mutation call-sites: failures
 * are logged but never bubble up to the user.
 */
export const writeAuditEntry = async (db: Db, params: WriteAuditParams): Promise<void> => {
  try {
    const { userId, userEmail, action, targetId = null, detail = null } = params;

    // Read the last entry to form the hash chain (SQLite and PG/MySQL differ in
    // column type for timestamp, but hash is always text/varchar).
    const last = await db.query.adminAudit.findFirst({
      orderBy: desc(adminAudit.id),
      columns: { hash: true },
    });

    const prevHash = last?.hash ?? "";
    const timestamp = new Date();
    const detailStr = detail ? JSON.stringify(detail) : "";

    const hash = computeHash(
      prevHash,
      timestamp,
      userId,
      action,
      targetId ?? "",
      detailStr,
    );

    await db.insert(adminAudit).values({
      timestamp,
      userId,
      userEmail,
      action,
      targetId: targetId ?? null,
      detail: detailStr || null,
      prevHash: prevHash || null,
      hash,
    });
  } catch (err) {
    // Audit failures must never break mutations. Log and continue.
    console.error("[audit] writeAuditEntry failed:", err);
  }
};

export interface AuditVerifyResult {
  ok: boolean;
  totalEntries: number;
  firstBrokenId: number | null;
}

/**
 * Walk the entire audit chain in insertion order and verify every hash.
 * Returns ok=true when all hashes match, or ok=false with the id of the first
 * broken entry.
 */
export const verifyAuditChain = async (db: Db): Promise<AuditVerifyResult> => {
  const entries = await db.query.adminAudit.findMany({
    orderBy: asc(adminAudit.id),
  });

  let prevHash = "";
  for (const entry of entries) {
    const detailStr = entry.detail ?? "";
    const expected = computeHash(
      prevHash,
      entry.timestamp instanceof Date ? entry.timestamp : new Date(entry.timestamp),
      entry.userId,
      entry.action,
      entry.targetId ?? "",
      detailStr,
    );
    if (entry.hash !== expected) {
      return { ok: false, totalEntries: entries.length, firstBrokenId: entry.id };
    }
    prevHash = entry.hash;
  }

  return { ok: true, totalEntries: entries.length, firstBrokenId: null };
};
