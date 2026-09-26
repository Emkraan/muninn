import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

import type Database from "better-sqlite3";

/**
 * Drop-in replacement for drizzle-orm's `migrate()` (drizzle-orm/better-sqlite3/migrator)
 * that tolerates migration files without "--> statement-breakpoint" separators.
 *
 * Background (muninn#170): drizzle-orm's own migrator splits each migration file on the
 * literal string "--> statement-breakpoint" and runs every resulting chunk through
 * `session.run()`, which prepares it as a single SQL statement. A chunk that itself
 * contains more than one statement (e.g. several `ALTER TABLE ... ADD ...` lines with no
 * breakpoint marker between them, as in migrations/sqlite/0047_audit_standard_columns.sql
 * and 0048_audit_context_columns.sql) makes better-sqlite3 throw:
 *   RangeError: The supplied SQL string contains more than one statement
 *
 * 0047/0048 are already-shipped, already-applied migrations. Editing them in place would
 * change the file's content hash, which drizzle's migration ledger (__drizzle_migrations)
 * uses to detect "already applied" — a hash change makes drizzle think the migration was
 * never run and try to re-apply it, which would then fail on the columns/objects it
 * already created on real deployments. So this fixes the *runner*, not the shipped SQL.
 *
 * This function stays wire-compatible with drizzle's own migrator:
 *  - Uses the same ledger table name/shape ("__drizzle_migrations": id, hash, created_at)
 *    so a database previously migrated by drizzle-orm's migrate() is recognised as
 *    up to date, and no migration is bogus-replayed.
 *  - Computes each migration's hash identically (sha256 of the raw file text, including
 *    any breakpoint markers), so ledger rows written by either implementation compare
 *    equal.
 *
 * The only behavioural difference is *how* a pending migration file is executed: instead
 * of splitting on the breakpoint marker and preparing each piece, the whole file is handed
 * to `Database.exec()`, which natively supports a string containing multiple ';'-terminated
 * statements. "--> statement-breakpoint" lines are themselves valid SQL line comments
 * (they start with "--"), so passing them through unmodified is harmless.
 */
export function robustMigrateSqlite(sqlite: Database.Database, config: { migrationsFolder: string }): void {
  const migrationsFolder = config.migrationsFolder;
  const journalPath = `${migrationsFolder}/meta/_journal.json`;

  if (!existsSync(journalPath)) {
    throw new Error(`Can't find meta/_journal.json file`);
  }

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries: { idx: number; tag: string; when: number; breakpoints: boolean }[];
  };

  sqlite.exec(`CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
		id SERIAL PRIMARY KEY,
		hash text NOT NULL,
		created_at numeric
	)`);

  const lastRow = sqlite
    .prepare(`SELECT id, hash, created_at FROM "__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`)
    .get() as { created_at: number } | undefined;
  const lastAppliedMillis = lastRow ? Number(lastRow.created_at) : undefined;

  const insertLedgerRow = sqlite.prepare(`INSERT INTO "__drizzle_migrations" ("hash", "created_at") VALUES (?, ?)`);

  const pending = journal.entries.filter((entry) => lastAppliedMillis === undefined || lastAppliedMillis < entry.when);

  for (const entry of pending) {
    const filePath = `${migrationsFolder}/${entry.tag}.sql`;
    const raw = readFileSync(filePath, "utf8");
    const hash = createHash("sha256").update(raw).digest("hex");

    const applyMigration = sqlite.transaction(() => {
      sqlite.exec(raw);
      insertLedgerRow.run(hash, entry.when);
    });
    applyMigration();
  }
}
