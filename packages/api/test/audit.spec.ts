import { createHmac, hkdfSync } from "crypto";

import type { Database } from "better-sqlite3";
import { beforeEach, describe, expect, test, vi } from "vitest";

const SECRET_ENCRYPTION_KEY = "ff3f4f7ce30e870c9630de9e5d244ffa81101a24ed0dfe5f064beb53a7e684f";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "true";
  process.env.SECRET_ENCRYPTION_KEY = "ff3f4f7ce30e870c9630de9e5d244ffa81101a24ed0dfe5f064beb53a7e684f";
  process.env.ENABLE_DNS_CACHING = "false";
});

import { adminAudit } from "@homarr/db/schema";
import { createDb } from "@homarr/db/test";

import { verifyAuditChain } from "../src/audit";

/**
 * Regression coverage for the admin_audit column-naming bug: the app's Drizzle
 * config uses global `casing: "snake_case"` (packages/core/src/infrastructure/db/constants.ts),
 * so any adminAudit column without an explicit name override is queried by its
 * snake_case form. The original migrations (0014/0015 on postgres, 0046/0047 on
 * sqlite, 0048 on mysql) created several of those columns in camelCase (userId,
 * userEmail, targetId, prevHash, resourceType, resourceId, errorMessage), which
 * never matched what the query builder actually asked for. That mismatch is what
 * made GET /api/health/ready report the audit subsystem as down (503):
 * `db.select().from(adminAudit)` referenced columns the live table didn't have.
 *
 * The fix is migrations/{postgresql,sqlite,mysql}/00xx_audit_snake_case_columns.sql
 * (renaming the columns, verified live against the postgres deployment) plus
 * matching explicit column-name overrides in the Drizzle schema files.
 *
 * This test replicates the row shape found on the live table (rows written
 * before the schema/casing convention existed) directly via raw SQL, matching
 * how `admin_audit.id` is actually declared in every dialect's initial
 * migration (an auto-incrementing integer primary key, NOT the createId()
 * string the schema/application code assumes -- a separate, pre-existing
 * mismatch out of scope for this fix, filed separately). It then proves two
 * things through the ORM layer, post-rename:
 *  1. the health-check-style query succeeds;
 *  2. the HMAC hash chain -- which hashes row VALUES, never column names --
 *     still verifies when read back through the renamed columns.
 */
describe("admin_audit schema/column-naming regression", () => {
  let db: ReturnType<typeof createDb>;

  beforeEach(() => {
    db = createDb();
  });

  test("the /api/health/ready style audit query succeeds against a migrated DB", async () => {
    await expect(db.select().from(adminAudit).limit(1)).resolves.toEqual([]);
  });

  test("the hash chain still verifies through the renamed columns", async () => {
    // Mirrors packages/api/src/audit.ts's computeHash exactly (key derivation +
    // payload shape), simulating rows that were written before this migration.
    const auditKey = Buffer.from(hkdfSync("sha256", Buffer.from(SECRET_ENCRYPTION_KEY, "hex"), "", "admin-audit", 32));
    const computeHash = (
      prevHash: string,
      timestamp: Date,
      userId: string,
      action: string,
      targetId: string,
      detail: string,
    ) => {
      const payload = [prevHash, timestamp.toISOString(), userId, action, targetId, detail].join("|");
      return createHmac("sha256", auditKey).update(payload).digest("hex");
    };

    // @ts-expect-error -- reaching into the driver to run a raw insert against
    // the live column set (including the auto-increment integer `id`, which
    // the ORM schema/application layer does not currently model correctly).
    const sqlite = db.session.client as Database;

    const t1 = new Date("2026-01-01T00:00:00.000Z");
    const t2 = new Date("2026-01-01T00:05:00.000Z");
    const hash1 = computeHash("", t1, "user-1", "invite.createInvite", "invite-1", "");
    const hash2 = computeHash(hash1, t2, "user-1", "invite.deleteInvite", "invite-1", "");

    const insert = sqlite.prepare(
      `INSERT INTO admin_audit (timestamp, user_id, user_email, action, target_id, detail, prev_hash, hash, outcome, resource_type, resource_id, error_message, schema_version, created_at)
       VALUES (@timestamp, @userId, @userEmail, @action, @targetId, @detail, @prevHash, @hash, @outcome, @resourceType, @resourceId, @errorMessage, @schemaVersion, @createdAt)`,
    );
    insert.run({
      timestamp: Math.floor(t1.getTime() / 1000),
      userId: "user-1",
      userEmail: "user1@example.com",
      action: "invite.createInvite",
      targetId: "invite-1",
      detail: null,
      prevHash: null,
      hash: hash1,
      outcome: "success",
      resourceType: "invite",
      resourceId: "invite-1",
      errorMessage: null,
      schemaVersion: 2,
      createdAt: Math.floor(t1.getTime() / 1000),
    });
    insert.run({
      timestamp: Math.floor(t2.getTime() / 1000),
      userId: "user-1",
      userEmail: "user1@example.com",
      action: "invite.deleteInvite",
      targetId: "invite-1",
      detail: null,
      prevHash: hash1,
      hash: hash2,
      outcome: "failure",
      resourceType: "invite",
      resourceId: "invite-1",
      errorMessage: "not found",
      schemaVersion: 2,
      createdAt: Math.floor(t2.getTime() / 1000),
    });

    const rows = await db.select().from(adminAudit);
    expect(rows).toHaveLength(2);
    // The renamed columns round-trip correctly through the Drizzle query builder.
    expect(rows[0]?.userId).toBe("user-1");
    expect(rows[0]?.userEmail).toBe("user1@example.com");
    expect(rows[0]?.targetId).toBe("invite-1");
    expect(rows[1]?.resourceType).toBe("invite");
    expect(rows[1]?.errorMessage).toBe("not found");
    expect(rows[1]?.prevHash).toBe(rows[0]?.hash);

    const result = await verifyAuditChain(db);
    expect(result.ok).toBe(true);
    expect(result.totalEntries).toBe(2);
    expect(result.firstBrokenId).toBeNull();
  });
});
