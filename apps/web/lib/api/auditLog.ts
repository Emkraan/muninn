import { prisma } from "@linkwarden/prisma";
import { Prisma } from "@linkwarden/prisma/client";
import crypto from "crypto";

const ZERO_HASH = "0".repeat(64);

// Deterministic serialization: sort object keys recursively so the hash is
// stable regardless of property insertion order.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value ?? null);
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

function computeHash(canonical: string): string {
  const secret = process.env.AUDIT_HMAC_SECRET;
  if (secret) {
    return crypto.createHmac("sha256", secret).update(canonical).digest("hex");
  }
  // Fallback keeps the chain intact even without a secret (weaker: not tamper-
  // proof against someone who can also recompute, but still detects accidental
  // edits). Preflight warns when the secret is unset.
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

export type AuditInput = {
  actorId?: number | null;
  actorLabel?: string;
  action: string;
  target?: string;
  context?: Record<string, unknown> | null;
  outcome?: "success" | "failure" | "error";
};

/**
 * Append one row to the tamper-evident audit chain. Non-fatal by contract:
 * a failure here never breaks the calling operation (audit is observability,
 * not a gate). Secret values must never be passed in `context`.
 */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const last = await tx.adminAudit.findFirst({
        orderBy: { id: "desc" },
        select: { hash: true },
      });
      const prevHash = last?.hash ?? ZERO_HASH;

      const entry = {
        actorId: input.actorId ?? null,
        actorLabel: input.actorLabel ?? "",
        action: input.action,
        target: input.target ?? "",
        context: input.context ?? null,
        outcome: input.outcome ?? "success",
        prevHash,
      };

      const hash = computeHash(stableStringify(entry));

      await tx.adminAudit.create({
        data: {
          actorId: entry.actorId,
          actorLabel: entry.actorLabel,
          action: entry.action,
          target: entry.target,
          context:
            entry.context === null
              ? undefined
              : (entry.context as Prisma.InputJsonValue),
          outcome: entry.outcome,
          prevHash,
          hash,
        },
      });
    });
  } catch (e) {
    // Swallow: auditing must never take down the primary action.
    console.error("[audit] failed to write entry:", e);
  }
}

/**
 * Verify the integrity of the audit chain. Returns the first break (or null if
 * intact). Used by the admin "verify audit" action and the test gate.
 */
export async function verifyAuditChain(): Promise<{
  ok: boolean;
  brokenAtId?: number;
  reason?: string;
}> {
  const rows = await prisma.adminAudit.findMany({ orderBy: { id: "asc" } });
  let prevHash = ZERO_HASH;
  for (const row of rows) {
    if (row.prevHash !== prevHash) {
      return {
        ok: false,
        brokenAtId: row.id,
        reason: "prevHash does not match previous row's hash",
      };
    }
    const entry = {
      actorId: row.actorId,
      actorLabel: row.actorLabel,
      action: row.action,
      target: row.target,
      context: row.context ?? null,
      outcome: row.outcome,
      prevHash: row.prevHash,
    };
    const expected = computeHash(stableStringify(entry));
    if (expected !== row.hash) {
      return {
        ok: false,
        brokenAtId: row.id,
        reason: "row hash does not match its content",
      };
    }
    prevHash = row.hash;
  }
  return { ok: true };
}
