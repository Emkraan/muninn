import { createHmac, hkdfSync } from "crypto";
import { existsSync, readFileSync } from "node:fs";

import BetterSqlite3 from "better-sqlite3";
import type { Database } from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { beforeEach, describe, expect, test, vi } from "vitest";

const SECRET_ENCRYPTION_KEY = "ff3f4f7ce30e870c9630de9e5d244ffa81101a24ed0dfe5f064beb53a7e684f";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "true";
  process.env.SECRET_ENCRYPTION_KEY = "ff3f4f7ce30e870c9630de9e5d244ffa81101a24ed0dfe5f064beb53a7e684f";
  process.env.ENABLE_DNS_CACHING = "false";
});

import { DB_CASING } from "@homarr/core/infrastructure/db/constants";
import { adminAudit, schema } from "@homarr/db/schema";
import { createDb } from "@homarr/db/test";

import { verifyAuditChain, writeAuditEntry } from "../src/audit";

/**
 * Applies every migrations/sqlite/*.sql file whose journal idx is <= maxIdx,
 * in order, against a fresh sqlite connection -- letting a test pin the
 * schema at an exact point in migration history (e.g. "right before the
 * admin_audit id-type fix landed") instead of always jumping to HEAD like
 * db/test's createDb() does.
 */
function applyMigrationsUpTo(sqlite: Database, maxIdx: number, fromIdx = 0): void {
  const migrationsFolder = "./packages/db/migrations/sqlite";
  const journalPath = `${migrationsFolder}/meta/_journal.json`;
  if (!existsSync(journalPath)) {
    throw new Error(`Can't find meta/_journal.json file`);
  }
  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { idx: number; tag: string }[];
  };
  for (const entry of journal.entries.filter((e) => e.idx <= maxIdx && e.idx >= fromIdx).sort((a, b) => a.idx - b.idx)) {
    const raw = readFileSync(`${migrationsFolder}/${entry.tag}.sql`, "utf8");
    // Mirrors migrations/sqlite/robust-migrate.ts: each file is applied inside
    // its own transaction (some early migrations carry their own embedded
    // BEGIN/COMMIT TRANSACTION statements that only balance out when each file
    // is run as a single unit).
    sqlite.transaction(() => {
      sqlite.exec(raw);
    })();
  }
}

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
 * before the schema/casing convention existed) directly via raw SQL, against a
 * fully-migrated test DB (id is now the text primary key from migration 0051 --
 * see admin_audit_id_to_text.spec.ts for coverage of that migration itself).
 * It then proves two things through the ORM layer, post-rename:
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

    // @ts-expect-error -- reaching into the driver to run a raw insert.
    const sqlite = db.session.client as Database;

    const t1 = new Date("2026-01-01T00:00:00.000Z");
    const t2 = new Date("2026-01-01T00:05:00.000Z");
    const hash1 = computeHash("", t1, "user-1", "invite.createInvite", "invite-1", "");
    const hash2 = computeHash(hash1, t2, "user-1", "invite.deleteInvite", "invite-1", "");

    const insert = sqlite.prepare(
      `INSERT INTO admin_audit (id, timestamp, user_id, user_email, action, target_id, detail, prev_hash, hash, outcome, resource_type, resource_id, error_message, schema_version, created_at)
       VALUES (@id, @timestamp, @userId, @userEmail, @action, @targetId, @detail, @prevHash, @hash, @outcome, @resourceType, @resourceId, @errorMessage, @schemaVersion, @createdAt)`,
    );
    insert.run({
      id: "00000000000000000001",
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
      id: "00000000000000000002",
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

/**
 * Regression coverage for the admin_audit id-type bug: admin_audit.id was
 * declared varchar/text in the Drizzle schema from the start, and
 * writeAuditEntry (packages/api/src/audit.ts) has always inserted a
 * createId() (cuid2) string for it, but the live table was created (sqlite
 * migration 0046, mirrored on postgres/mysql) as an auto-incrementing
 * INTEGER primary key -- so every real audit write failed with a type
 * mismatch. Confirmed live against the production Postgres deployment via
 * `\d admin_audit` (integer, generated always as identity; 0 rows).
 *
 * Fixed by migrations/sqlite/0051_audit_id_to_text.sql (postgresql 0019 /
 * mysql 0052 are the equivalent migrations for those dialects), which
 * rebuilds the table with a text primary key and backfills any existing
 * integer ids as zero-padded 20-digit decimal strings.
 *
 * This test seeds rows in the exact pre-fix shape (auto-incrementing integer
 * id, via a raw insert that omits id entirely, exactly like a real legacy
 * row), applies migration 0051 on top, and then proves through the same
 * application code paths used in production that:
 *  1. the legacy rows still verify (id is never part of the HMAC hash
 *     payload, so backfilling it doesn't invalidate anything);
 *  2. writeAuditEntry -- the real production write path, unmodified --
 *     succeeds against the migrated table;
 *  3. the chain continues: the new row's prevHash links to the last legacy
 *     row's hash, and ORDER BY id (used by both writeAuditEntry to find the
 *     previous row and verifyAuditChain to walk the chain) still returns
 *     every row in insertion order, because cuid2 ids always start with a
 *     lowercase letter, which sorts after any zero-padded digit string.
 */
describe("admin_audit id-type migration (0051/0019/0052)", () => {
  test("legacy integer-id rows survive the migration, verify, and a new write extends the chain", async () => {
    const sqlite = new BetterSqlite3(":memory:");
    // Pin the schema at "everything except the id-type fix" (idx 50 is the
    // last migration before 0051), matching exactly what's live in production.
    applyMigrationsUpTo(sqlite, 50);

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

    const t1 = new Date("2026-01-01T00:00:00.000Z");
    const t2 = new Date("2026-01-01T00:05:00.000Z");
    const hash1 = computeHash("", t1, "user-1", "invite.createInvite", "invite-1", "");
    const hash2 = computeHash(hash1, t2, "user-1", "invite.deleteInvite", "invite-1", "");

    // Deliberately omits `id`: pre-fix, admin_audit.id is
    // `integer PRIMARY KEY AUTOINCREMENT`, exactly like the live table.
    const insert = sqlite.prepare(
      `INSERT INTO admin_audit (timestamp, user_id, user_email, action, target_id, detail, prev_hash, hash, outcome, schema_version, created_at)
       VALUES (@timestamp, @userId, @userEmail, @action, @targetId, @detail, @prevHash, @hash, @outcome, @schemaVersion, @createdAt)`,
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
      schemaVersion: 2,
      createdAt: Math.floor(t2.getTime() / 1000),
    });

    // Sanity check on the pre-migration shape itself.
    const legacyRows = sqlite.prepare("SELECT id FROM admin_audit ORDER BY id").all() as { id: number }[];
    expect(legacyRows.map((r) => r.id)).toEqual([1, 2]);

    // Apply the fix (just the one new migration; everything up to 50 is already applied).
    applyMigrationsUpTo(sqlite, 51, 51);

    const db = drizzle(sqlite, { schema, casing: DB_CASING });

    const migratedRows = await db.select().from(adminAudit).orderBy(adminAudit.id);
    expect(migratedRows).toHaveLength(2);
    // Legacy integer ids come back as zero-padded decimal strings.
    expect(migratedRows[0]?.id).toBe("00000000000000000001");
    expect(migratedRows[1]?.id).toBe("00000000000000000002");

    // 1. Legacy rows still verify: id was never part of the hash payload.
    const beforeWrite = await verifyAuditChain(db);
    expect(beforeWrite.ok).toBe(true);
    expect(beforeWrite.totalEntries).toBe(2);
    expect(beforeWrite.firstBrokenId).toBeNull();

    // 2. The real production write path succeeds against the migrated table.
    await writeAuditEntry(db, {
      userId: "user-2",
      userEmail: "user2@example.com",
      action: "invite.createInvite",
      targetId: "invite-2",
      outcome: "success",
      resourceType: "invite",
      resourceId: "invite-2",
    });

    const allRows = await db.select().from(adminAudit).orderBy(adminAudit.id);
    expect(allRows).toHaveLength(3);
    // The new row's id is a cuid2 string, which always starts with a lowercase
    // letter -- so it sorts after every zero-padded legacy id (ASCII digits <
    // letters), keeping ORDER BY id in true insertion order.
    expect(allRows[2]?.id).toMatch(/^[a-z]/);
    expect((allRows[2]?.id ?? "") > (allRows[1]?.id ?? "")).toBe(true);
    // writeAuditEntry read the last row (by ORDER BY id desc) to link the chain.
    expect(allRows[2]?.prevHash).toBe(allRows[1]?.hash);

    // 3. The chain continues end-to-end, legacy rows and the new row alike.
    const afterWrite = await verifyAuditChain(db);
    expect(afterWrite.ok).toBe(true);
    expect(afterWrite.totalEntries).toBe(3);
    expect(afterWrite.firstBrokenId).toBeNull();
  });
});
