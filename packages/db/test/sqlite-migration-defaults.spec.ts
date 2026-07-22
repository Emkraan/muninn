import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "vitest";

// SQLite forbids a non-constant default on `ALTER TABLE ... ADD COLUMN`
// ("Cannot add a column with non-constant default"), while the same
// expression is perfectly legal inside a `CREATE TABLE`. Newer builds of
// better-sqlite3 tolerate the illegal form, so it can pass local tests yet
// crash-loop the shipped container (whose SQLite is stricter). This static
// guard catches the whole class regardless of engine version.
const MIGRATIONS_DIR = join(__dirname, "..", "migrations", "sqlite");

// Non-constant / non-deterministic functions that are invalid as an
// ADD COLUMN default in SQLite.
const NON_CONSTANT = [
  "unixepoch",
  "current_timestamp",
  "current_time",
  "current_date",
  "now",
  "random",
  "randomblob",
  "julianday",
  "strftime",
  "datetime",
  "date",
  "time",
];

describe("sqlite migrations", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));

  test("have at least one migration to check", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test.each(files)(
    "%s uses only constant defaults on ALTER TABLE ADD COLUMN",
    (file) => {
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const offenders: string[] = [];

      for (const raw of sql.split("\n")) {
        const line = raw.trim();
        // Only `ALTER TABLE ... ADD [COLUMN] ...` statements are constrained.
        if (!/^ALTER\s+TABLE.+\bADD\b/i.test(line)) continue;
        if (!/\bDEFAULT\b/i.test(line)) continue;

        // Drop single-quoted string literals so a legitimate text default
        // (e.g. DEFAULT 'time') is not mistaken for a function call.
        const stripped = line.replace(/'[^']*'/g, "''");
        const lower = stripped.toLowerCase();
        if (NON_CONSTANT.some((fn) => lower.includes(`${fn}(`))) {
          offenders.push(line);
        }
      }

      expect(offenders, offenders.join("\n")).toEqual([]);
    },
  );
});
