-- Rename legacy camelCase admin_audit columns to snake_case so they match
-- the application's global Drizzle "snake_case" casing convention (see
-- packages/core/src/infrastructure/db/constants.ts, DB_CASING). Columns
-- added in 0046/0047 predate that convention: any Drizzle-built column
-- reference without an explicit name override (userId, userEmail, targetId,
-- prevHash, resourceType, resourceId, errorMessage) is rendered by the query
-- builder as its snake_case form (user_id, user_email, ...), which never
-- existed in the live table -- the same defect confirmed live on Postgres
-- via the /api/health/ready audit subsystem check (503).
--
-- RENAME COLUMN only updates the catalog entry; existing row VALUES are
-- untouched, so the audit HMAC hash chain (computed over row values, never
-- column names -- see packages/api/src/audit.ts computeHash/verifyAuditChain)
-- remains valid after this migration.
--
-- The admin_audit_fts triggers reference the renamed columns by name (via
-- new.userEmail / old.targetId, etc.), so they are dropped and recreated
-- against the new names. The FTS5 virtual table itself is untouched: its own
-- column names (user_email, action, target_id, detail) never changed.

DROP TRIGGER IF EXISTS `admin_audit_fts_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `admin_audit_fts_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `admin_audit_fts_update`;
--> statement-breakpoint
ALTER TABLE `admin_audit` RENAME COLUMN `userId` TO `user_id`;
--> statement-breakpoint
ALTER TABLE `admin_audit` RENAME COLUMN `userEmail` TO `user_email`;
--> statement-breakpoint
ALTER TABLE `admin_audit` RENAME COLUMN `targetId` TO `target_id`;
--> statement-breakpoint
ALTER TABLE `admin_audit` RENAME COLUMN `prevHash` TO `prev_hash`;
--> statement-breakpoint
ALTER TABLE `admin_audit` RENAME COLUMN `resourceType` TO `resource_type`;
--> statement-breakpoint
ALTER TABLE `admin_audit` RENAME COLUMN `resourceId` TO `resource_id`;
--> statement-breakpoint
ALTER TABLE `admin_audit` RENAME COLUMN `errorMessage` TO `error_message`;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `admin_audit_fts_insert` AFTER INSERT ON `admin_audit` BEGIN
  INSERT INTO `admin_audit_fts`(`rowid`, `entry_id`, `user_email`, `action`, `target_id`, `detail`)
  VALUES (new.rowid, new.id, new.user_email, new.action, new.target_id, new.detail);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `admin_audit_fts_delete` AFTER DELETE ON `admin_audit` BEGIN
  INSERT INTO `admin_audit_fts`(`admin_audit_fts`, `rowid`, `entry_id`, `user_email`, `action`, `target_id`, `detail`)
  VALUES ('delete', old.rowid, old.id, old.user_email, old.action, old.target_id, old.detail);
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `admin_audit_fts_update` AFTER UPDATE ON `admin_audit` BEGIN
  INSERT INTO `admin_audit_fts`(`admin_audit_fts`, `rowid`, `entry_id`, `user_email`, `action`, `target_id`, `detail`)
  VALUES ('delete', old.rowid, old.id, old.user_email, old.action, old.target_id, old.detail);
  INSERT INTO `admin_audit_fts`(`rowid`, `entry_id`, `user_email`, `action`, `target_id`, `detail`)
  VALUES (new.rowid, new.id, new.user_email, new.action, new.target_id, new.detail);
END;
