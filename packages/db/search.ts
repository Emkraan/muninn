import type { Column, SQL } from "drizzle-orm";
import { like, sql } from "drizzle-orm";

/**
 * Case-insensitive "contains" match for user-facing name search, portable across
 * all supported drivers.
 *
 * Postgres `LIKE` is case-sensitive (SQLite's is not), so a plain
 * `like(column, "%term%")` silently fails to match differently-cased text on a
 * Postgres deployment - typing "grafana" would not match a "Grafana" row. That
 * is invisible in the SQLite default and in the SQLite-backed tests, which is
 * how it shipped. Lowercasing both the column and the term makes matching
 * uniform on SQLite, Postgres and MySQL (all support `lower()`).
 *
 * Use this for search boxes; do not use it for exact-identity or uniqueness
 * checks where case is meaningful.
 */
export const likeInsensitive = (column: Column | SQL.Aliased | SQL, term: string): SQL =>
  like(sql`lower(${column})`, `%${term.trim().toLowerCase()}%`);

/**
 * Case-insensitive "starts with" match, portable across drivers. Same rationale
 * as {@link likeInsensitive} but anchored to the start of the value (for short
 * codes / prefix triggers).
 */
export const startsWithInsensitive = (column: Column | SQL.Aliased | SQL, term: string): SQL =>
  like(sql`lower(${column})`, `${term.trim().toLowerCase()}%`);
