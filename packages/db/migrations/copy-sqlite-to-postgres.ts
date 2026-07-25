import Database from "better-sqlite3";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";
import { drizzle as drizzlePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { DB_CASING } from "@homarr/core/infrastructure/db/constants";

import * as pgSchema from "../schema/postgresql";
import * as sqliteSchema from "../schema/sqlite";
import type { TableCopyResult } from "./copy-sqlite-to-postgres.core";
import { copyAllTables } from "./copy-sqlite-to-postgres.core";

/**
 * One-shot data migration: copy a live Homarr/Muninn SQLite database into a
 * freshly-migrated PostgreSQL database.
 *
 * Usage (inside the container, WORKDIR /app):
 *   node ./db/copy-sqlite-to-postgres.cjs <sqlite-file-path> [--truncate]
 *
 * Environment:
 *   DB_URL                 node-postgres connection string of the TARGET Postgres.
 *                          MUST be a SUPERUSER role: the copy runs with
 *                          `session_replication_role = 'replica'` to disable FK
 *                          checks, which only a superuser may set.
 *   SECRET_ENCRYPTION_KEY  Unchanged across the migration. The 4 encrypted
 *                          columns (oidcProvider.clientSecret,
 *                          integrationSecret.value, custom_widget_secret.value,
 *                          widget_secret.value) are copied verbatim; nothing is
 *                          decrypted or re-encrypted here.
 *
 * Flags:
 *   --truncate             TRUNCATE ... CASCADE every target table before
 *                          copying. Required for a real migration because a
 *                          freshly-migrated Homarr DB is seeded (onboarding,
 *                          server settings, default groups, ...), so the target
 *                          is never actually empty. Without it the tool aborts
 *                          if any target table already holds rows.
 */
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--")));
const positionals = args.filter((arg) => !arg.startsWith("--"));

const sqlitePath = positionals[0];
const truncate = flags.has("--truncate");

const printResultsTable = (results: TableCopyResult[]): void => {
  const nameWidth = Math.max(5, ...results.map((result) => result.tableName.length));
  const header = `${"TABLE".padEnd(nameWidth)}  ${"SOURCE".padStart(8)}  ${"TARGET".padStart(8)}  STATUS`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const result of results) {
    console.log(
      `${result.tableName.padEnd(nameWidth)}  ${String(result.sourceCount).padStart(8)}  ` +
        `${String(result.targetCount).padStart(8)}  ${result.matched ? "OK" : "MISMATCH"}`,
    );
  }
};

const run = async (): Promise<void> => {
  if (!sqlitePath) {
    throw new Error("Missing <sqlite-file-path>. Usage: node copy-sqlite-to-postgres.cjs <sqlite-file-path> [--truncate]");
  }

  const dbUrl = process.env.DB_URL;
  if (!dbUrl) {
    throw new Error("DB_URL env var (target Postgres connection string) is required.");
  }

  console.log(`Source SQLite : ${sqlitePath}`);
  console.log(`Target DB_URL : ${dbUrl.replace(/:[^:@/]*@/, ":***@")}`);
  console.log(`Truncate first: ${truncate ? "yes" : "no"}`);

  // Source is opened read-only: the tool never writes to the SQLite file.
  const sqliteConnection = new Database(sqlitePath, { readonly: true, fileMustExist: true });
  const sqliteDb = drizzleSqlite(sqliteConnection, { schema: sqliteSchema, casing: DB_CASING });

  const pool = new Pool({ connectionString: dbUrl });
  const pgDb = drizzlePostgres({ client: pool, schema: pgSchema, casing: DB_CASING });

  try {
    const outcome = await copyAllTables({
      sqliteDb,
      pgDb,
      truncate,
      log: (message) => console.log(message),
    });

    console.log("");
    console.log(`Skipped transient auth tables (users re-login): ${outcome.skippedTableKeys.join(", ")}`);
    console.log(`Copied ${outcome.copiedTableKeys.length} tables (accounts included for OIDC identity linkage).`);
    console.log("");
    printResultsTable(outcome.results);

    if (outcome.hasMismatch) {
      const mismatched = outcome.results.filter((result) => !result.matched).map((result) => result.tableName);
      throw new Error(`Row-count mismatch on: ${mismatched.join(", ")}`);
    }

    console.log("");
    console.log("All table row counts match. Copy complete.");
  } finally {
    sqliteConnection.close();
    await pool.end();
  }
};

run()
  .then(() => {
    process.exit(0);
  })
  .catch((error: unknown) => {
    console.error("Copy failed:", error);
    process.exit(1);
  });
