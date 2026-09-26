-- The Drizzle schema (packages/db/schema/postgresql.ts) has always declared
-- admin_audit.id as varchar/text, and writeAuditEntry (packages/api/src/audit.ts)
-- has always inserted a createId() string for it. The live table, however, was
-- created (migration 0014) as `integer generated always as identity` and never
-- corrected, so every audit write fails with a type mismatch:
--   insert into "admin_audit" ("id", ...) values ($1, ...) -- $1 is a cuid2 string
--   error: invalid input syntax for type integer
--
-- Confirmed live via `\d admin_audit` (LXC-101 postgres container, db "muninn"):
-- id is `integer` with `generated always as identity`, and the table currently
-- holds 0 rows in production.
--
-- This migration converts id to a text primary key while preserving every row:
-- existing integer ids are backfilled as zero-padded decimal strings so plain
-- lexicographic ORDER BY id (used by writeAuditEntry/verifyAuditChain in
-- packages/api/src/audit.ts) still returns rows in the same order. Zero-padding
-- to 20 digits covers the full bigint range and, since cuid2 ids (used for all
-- new rows going forward) always start with a lowercase letter, every
-- zero-padded legacy id still sorts before every new id (ASCII digits < letters).
--
-- id is NOT part of the HMAC hash payload (see audit.ts computeHash: the
-- payload is prevHash|timestamp|userId|action|targetId|detail), so changing
-- id's representation does not invalidate any existing row's hash and no
-- rehashing is required.
--
-- The generated search_vector column does not reference id, so it is left
-- untouched.

ALTER TABLE "admin_audit" DROP CONSTRAINT IF EXISTS "admin_audit_pkey";
--> statement-breakpoint
ALTER TABLE "admin_audit" RENAME COLUMN "id" TO "id_old";
--> statement-breakpoint
ALTER TABLE "admin_audit" ADD COLUMN "id" TEXT;
--> statement-breakpoint
UPDATE "admin_audit" SET "id" = lpad("id_old"::text, 20, '0');
--> statement-breakpoint
ALTER TABLE "admin_audit" ALTER COLUMN "id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "admin_audit" ADD PRIMARY KEY ("id");
--> statement-breakpoint
ALTER TABLE "admin_audit" DROP COLUMN "id_old";
