-- Rename legacy camelCase admin_audit columns to snake_case so they match
-- the application's global Drizzle "snake_case" casing convention (see
-- packages/core/src/infrastructure/db/constants.ts, DB_CASING). Columns
-- added in 0048 predate that convention: any Drizzle-built column reference
-- without an explicit name override (userId, userEmail, targetId, prevHash,
-- resourceType, resourceId, errorMessage) is rendered by the query builder as
-- its snake_case form (user_id, user_email, ...), which never existed in the
-- live table -- the same defect confirmed live on Postgres via the
-- /api/health/ready audit subsystem check (503).
--
-- CHANGE COLUMN only renames the catalog entry; existing row VALUES are
-- untouched, so the audit HMAC hash chain (computed over row values, never
-- column names -- see packages/api/src/audit.ts computeHash/verifyAuditChain)
-- remains valid after this migration.

ALTER TABLE `admin_audit`
  CHANGE COLUMN `userId` `user_id` VARCHAR(64) NOT NULL,
  CHANGE COLUMN `userEmail` `user_email` VARCHAR(256) NOT NULL,
  CHANGE COLUMN `targetId` `target_id` VARCHAR(64),
  CHANGE COLUMN `prevHash` `prev_hash` VARCHAR(128),
  CHANGE COLUMN `resourceType` `resource_type` VARCHAR(64),
  CHANGE COLUMN `resourceId` `resource_id` VARCHAR(64),
  CHANGE COLUMN `errorMessage` `error_message` TEXT;
