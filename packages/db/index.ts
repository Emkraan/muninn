import { createDb } from "@homarr/core/infrastructure/db";

import { schema } from "./schema";

export * from "drizzle-orm";
export type { HomarrDatabaseMysql, HomarrDatabasePostgresql } from "./driver";

export const db = createDb(schema);

export type Database = typeof db;

export { handleDiffrentDbDriverOperationsAsync as handleTransactionsAsync } from "./transactions";
export { isMysql, isPostgresql } from "./collection";
export { likeInsensitive, startsWithInsensitive } from "./search";
