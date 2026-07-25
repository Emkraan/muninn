import { getTableName, is, sql, Table } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { PgDatabase, PgTable } from "drizzle-orm/pg-core";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";

import * as pgSchema from "../schema/postgresql";
import * as sqliteSchema from "../schema/sqlite";

/**
 * Transient NextAuth tables that are intentionally NOT copied.
 *
 * `sessions` and `verificationTokens` hold short-lived login/verification state.
 * After the cutover every user simply logs in again, which re-creates their
 * session, so copying them buys nothing and would only drag stale rows across.
 *
 * `accounts` is deliberately NOT in this list: it stores the OIDC/OAuth identity
 * linkage (provider + providerAccountId -> userId) and MUST be copied so that
 * existing SSO users map back onto their accounts after the migration.
 */
export const SKIPPED_TABLE_KEYS: readonly string[] = ["sessions", "verificationTokens"];

/**
 * Postgres has a ~65k bind-parameter limit per statement. With the widest table
 * (oidcProvider, ~35 columns) 500 rows stays comfortably under that ceiling.
 */
const CHUNK_SIZE = 500;

export interface TableCopyResult {
  /** Drizzle export key (e.g. `boardUserPermissions`). */
  key: string;
  /** Physical table name in the database (e.g. `boardUserPermission`). */
  tableName: string;
  sourceCount: number;
  targetCount: number;
  matched: boolean;
}

export interface CopyOutcome {
  results: TableCopyResult[];
  hasMismatch: boolean;
  copiedTableKeys: string[];
  skippedTableKeys: string[];
  truncated: boolean;
}

interface TablePair {
  key: string;
  tableName: string;
  sqliteTable: SQLiteTable;
  pgTable: PgTable;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySqliteDb = BetterSQLite3Database<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPgDb = PgDatabase<any, any>;

const noopLog = (_message: string): void => {
  /* no-op */
};

/**
 * All Postgres tables that exist in the schema, including the transient auth
 * tables. Used only for the `--truncate` reset so the target is fully cleared.
 */
const resolveAllPgTables = (): { tableName: string; pgTable: PgTable }[] => {
  const tables: { tableName: string; pgTable: PgTable }[] = [];
  for (const value of Object.values(pgSchema)) {
    if (!is(value, Table)) continue;
    const pgTable = value as unknown as PgTable;
    tables.push({ tableName: getTableName(pgTable), pgTable });
  }
  return tables;
};

/**
 * Pairs every SQLite table with its Postgres counterpart by shared export key,
 * excluding the intentionally-skipped transient tables. Both dialect schemas
 * export the same identifiers, so the key is a reliable join.
 */
const resolveTablePairs = (): TablePair[] => {
  const pairs: TablePair[] = [];
  const sqliteEntries = sqliteSchema as unknown as Record<string, unknown>;
  const pgEntries = pgSchema as unknown as Record<string, unknown>;

  for (const key of Object.keys(sqliteEntries)) {
    if (SKIPPED_TABLE_KEYS.includes(key)) continue;

    const sqliteValue = sqliteEntries[key];
    const pgValue = pgEntries[key];
    if (!is(sqliteValue, Table) || !is(pgValue, Table)) continue;

    const pgTable = pgValue as unknown as PgTable;
    pairs.push({
      key,
      tableName: getTableName(pgTable),
      sqliteTable: sqliteValue as unknown as SQLiteTable,
      pgTable,
    });
  }

  return pairs;
};

const countRows = async (db: AnySqliteDb | AnyPgDb, table: SQLiteTable | PgTable): Promise<number> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await db
    .select({ value: sql<number>`count(*)` })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .from(table as any)) as { value: number | string }[];
  return Number(rows[0]?.value ?? 0);
};

const chunk = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

/**
 * Copies every non-transient table from a Homarr/Muninn SQLite database into a
 * freshly-migrated Postgres database using drizzle select-then-insert, so the
 * ORM performs every dialect conversion (epoch-int timestamps -> pg timestamps,
 * int -> boolean, blob -> bytea) automatically. Encrypted ciphertext, superJSON
 * text columns and binary media are copied verbatim (never re-serialized).
 *
 * The whole copy runs inside ONE Postgres transaction that sets
 * `session_replication_role = 'replica'`, which disables FK and trigger checks
 * for the duration. This is what makes the circular / self-referential foreign
 * keys (users<->boards, groups->users/boards, section_layout self-ref) copyable
 * in any order. It requires a SUPERUSER connection (production uses one).
 */
export const copyAllTables = async (options: {
  sqliteDb: AnySqliteDb;
  pgDb: AnyPgDb;
  /** When true, TRUNCATE ... CASCADE every target table before copying. */
  truncate: boolean;
  log?: (message: string) => void;
}): Promise<CopyOutcome> => {
  const { sqliteDb, pgDb, truncate } = options;
  const log = options.log ?? noopLog;

  const pairs = resolveTablePairs();
  log(`Discovered ${pairs.length} tables to copy (skipping: ${SKIPPED_TABLE_KEYS.join(", ")}).`);

  // Safety gate: refuse to load into a target that already holds data, unless
  // the caller explicitly opts into wiping it first. This prevents an
  // accidental double-load (e.g. re-running the tool after a partial run).
  if (!truncate) {
    const nonEmpty: string[] = [];
    for (const pair of pairs) {
      const count = await countRows(pgDb, pair.pgTable);
      if (count > 0) nonEmpty.push(`${pair.tableName} (${count})`);
    }
    if (nonEmpty.length > 0) {
      throw new Error(
        `Target Postgres is not empty; refusing to copy. Non-empty tables: ${nonEmpty.join(", ")}. ` +
          `Re-run with --truncate to wipe the target first (a freshly-migrated Homarr DB is seeded, ` +
          `so --truncate is the expected path for a real migration).`,
      );
    }
  }

  const allPgTables = resolveAllPgTables();

  await pgDb.transaction(async (tx) => {
    if (truncate) {
      const quoted = allPgTables.map((entry) => `"${entry.tableName}"`).join(", ");
      log(`Truncating ${allPgTables.length} target tables (CASCADE).`);
      await tx.execute(sql.raw(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`));
    }

    // Disable FK/trigger enforcement for the copy so insert order is irrelevant
    // and circular references are preserved. Requires a superuser role.
    await tx.execute(sql`SET session_replication_role = 'replica'`);

    for (const pair of pairs) {
      const rows = (await sqliteDb.select().from(pair.sqliteTable as never)) as Record<string, unknown>[];
      if (rows.length === 0) {
        log(`  ${pair.tableName}: 0 rows`);
        continue;
      }

      for (const batch of chunk(rows, CHUNK_SIZE)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await tx.insert(pair.pgTable).values(batch as any);
      }
      log(`  ${pair.tableName}: ${rows.length} rows`);
    }

    // Restore normal enforcement before the transaction commits.
    await tx.execute(sql`SET session_replication_role = 'origin'`);
  });

  // Verify row counts match source vs target for every copied table.
  const results: TableCopyResult[] = [];
  for (const pair of pairs) {
    const sourceCount = await countRows(sqliteDb, pair.sqliteTable);
    const targetCount = await countRows(pgDb, pair.pgTable);
    results.push({
      key: pair.key,
      tableName: pair.tableName,
      sourceCount,
      targetCount,
      matched: sourceCount === targetCount,
    });
  }

  const hasMismatch = results.some((result) => !result.matched);

  return {
    results,
    hasMismatch,
    copiedTableKeys: pairs.map((pair) => pair.key),
    skippedTableKeys: [...SKIPPED_TABLE_KEYS],
    truncated: truncate,
  };
};
