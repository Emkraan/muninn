import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { createSharedDbConfig } from "@homarr/core/infrastructure/db";
import { dbEnv } from "@homarr/core/infrastructure/db/env";

import * as sqliteSchema from "../../schema/sqlite";
import { applyCustomMigrationsAsync } from "../custom";
import { seedDataAsync } from "../seed";
import { robustMigrateSqlite } from "./robust-migrate";

const migrationsFolder = process.argv[2] ?? ".";

const migrateAsync = async () => {
  const config = createSharedDbConfig(sqliteSchema);
  const connection = new Database(dbEnv.URL);
  const db = drizzle(connection, config);

  // Uses a custom migrator instead of drizzle-orm/better-sqlite3/migrator — see
  // packages/db/migrations/sqlite/robust-migrate.ts for why (muninn#170).
  robustMigrateSqlite(connection, { migrationsFolder });

  await seedDataAsync(db);
  await applyCustomMigrationsAsync(db);
};

migrateAsync()
  .then(() => {
    console.log("Migration complete");
    process.exit(0);
  })
  .catch((err) => {
    console.log("Migration failed", err);
    process.exit(1);
  });
