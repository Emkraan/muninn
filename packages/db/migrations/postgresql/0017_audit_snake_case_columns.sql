-- Rename legacy camelCase admin_audit columns to snake_case so they match
-- the application's global Drizzle "snake_case" casing convention (see
-- packages/core/src/infrastructure/db/constants.ts, DB_CASING). Columns
-- added in 0014/0015 predate that convention: any Drizzle-built column
-- reference without an explicit name override (userId, userEmail, targetId,
-- prevHash, resourceType, resourceId, errorMessage) is rendered by the query
-- builder as its snake_case form (user_id, user_email, ...), which never
-- existed in the live table. This is what made the /api/health/ready audit
-- subsystem check fail with a 503: `select ... from "admin_audit"` referenced
-- columns Postgres didn't have.
--
-- RENAME COLUMN only updates the catalog entry; existing row VALUES are
-- untouched, so the audit HMAC hash chain (computed over row values, never
-- column names -- see packages/api/src/audit.ts computeHash/verifyAuditChain)
-- remains valid after this migration.
--
-- The generated search_vector column references the renamed columns by name
-- and cannot be ALTERed in place, so it is dropped and recreated pointing at
-- the new names.

DROP INDEX IF EXISTS "admin_audit_search_vector_idx";
ALTER TABLE "admin_audit" DROP COLUMN IF EXISTS "search_vector";

ALTER TABLE "admin_audit" RENAME COLUMN "userId" TO "user_id";
ALTER TABLE "admin_audit" RENAME COLUMN "userEmail" TO "user_email";
ALTER TABLE "admin_audit" RENAME COLUMN "targetId" TO "target_id";
ALTER TABLE "admin_audit" RENAME COLUMN "prevHash" TO "prev_hash";
ALTER TABLE "admin_audit" RENAME COLUMN "resourceType" TO "resource_type";
ALTER TABLE "admin_audit" RENAME COLUMN "resourceId" TO "resource_id";
ALTER TABLE "admin_audit" RENAME COLUMN "errorMessage" TO "error_message";

ALTER TABLE "admin_audit"
  ADD COLUMN "search_vector" TSVECTOR
    GENERATED ALWAYS AS (
      to_tsvector('english',
        coalesce("user_email", '') || ' ' ||
        coalesce("action", '') || ' ' ||
        coalesce("target_id", '') || ' ' ||
        coalesce("detail", '')
      )
    ) STORED;

CREATE INDEX IF NOT EXISTS "admin_audit_search_vector_idx" ON "admin_audit" USING GIN("search_vector");
