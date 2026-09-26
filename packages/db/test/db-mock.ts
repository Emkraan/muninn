import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { DB_CASING } from "@homarr/core/infrastructure/db/constants";

import { robustMigrateSqlite } from "../migrations/sqlite/robust-migrate";
import * as sqliteSchema from "../schema/sqlite";

export const createDb = (debug?: boolean) => {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema: sqliteSchema, logger: debug, casing: DB_CASING });
  // Uses a custom migrator instead of drizzle-orm/better-sqlite3/migrator — see
  // packages/db/migrations/sqlite/robust-migrate.ts for why (muninn#170).
  robustMigrateSqlite(sqlite, {
    migrationsFolder: "./packages/db/migrations/sqlite",
  });

  if (debug) {
    console.log("Database created");
  }

  return db;
};
