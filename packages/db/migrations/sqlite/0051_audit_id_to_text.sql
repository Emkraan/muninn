-- Same defect as the Postgres/MySQL dialects (see the postgresql 0019 migration
-- for the full root-cause writeup): the Drizzle schema declares admin_audit.id
-- as text, but the live table was created (migration 0046) as
-- `integer PRIMARY KEY AUTOINCREMENT`, so writeAuditEntry's createId() string
-- insert fails.
--
-- SQLite cannot ALTER a column's type or drop/change a PRIMARY KEY in place, so
-- this rebuilds the table (the documented SQLite pattern for such changes) and
-- copies every row across, backfilling legacy integer ids as zero-padded
-- 20-digit decimal strings -- this preserves ORDER BY id ordering (used by
-- writeAuditEntry/verifyAuditChain in packages/api/src/audit.ts) both among
-- legacy rows and against future cuid2 ids, which always start with a
-- lowercase letter (ASCII digits < letters).
--
-- id is NOT part of the HMAC hash payload (prevHash|timestamp|userId|action|
-- targetId|detail in audit.ts computeHash), so no row's hash changes here.
--
-- The admin_audit_fts5 virtual table is content-linked via content_rowid=rowid,
-- i.e. SQLite's own internal rowid, not the `id` column -- once `id` stops
-- being `INTEGER PRIMARY KEY` it is no longer a rowid alias, but the table
-- still has an ordinary internal rowid. The explicit `rowid` copy below
-- preserves every row's existing rowid so the FTS index stays correctly
-- linked to the rebuilt table without needing to touch admin_audit_fts itself.

DROP TRIGGER IF EXISTS `admin_audit_fts_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `admin_audit_fts_delete`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `admin_audit_fts_update`;
--> statement-breakpoint
CREATE TABLE `__new_admin_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer NOT NULL,
	`user_id` text NOT NULL,
	`user_email` text NOT NULL,
	`action` text NOT NULL,
	`target_id` text,
	`detail` text,
	`prev_hash` text,
	`hash` text NOT NULL,
	`outcome` text,
	`resource_type` text,
	`resource_id` text,
	`error_message` text,
	`schema_version` integer NOT NULL DEFAULT 1,
	`actor_name` text,
	`actor_json` text,
	`context_ip` text,
	`context_user_agent` text,
	`context_request_id` text,
	`context_method` text,
	`context_path` text,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	`search_text` text
);
--> statement-breakpoint
INSERT INTO `__new_admin_audit`
  (`rowid`, `id`, `timestamp`, `user_id`, `user_email`, `action`, `target_id`, `detail`,
   `prev_hash`, `hash`, `outcome`, `resource_type`, `resource_id`, `error_message`,
   `schema_version`, `actor_name`, `actor_json`, `context_ip`, `context_user_agent`,
   `context_request_id`, `context_method`, `context_path`, `created_at`, `search_text`)
SELECT
  `rowid`, printf('%020d', `id`), `timestamp`, `user_id`, `user_email`, `action`, `target_id`, `detail`,
  `prev_hash`, `hash`, `outcome`, `resource_type`, `resource_id`, `error_message`,
  `schema_version`, `actor_name`, `actor_json`, `context_ip`, `context_user_agent`,
  `context_request_id`, `context_method`, `context_path`, `created_at`, `search_text`
FROM `admin_audit`;
--> statement-breakpoint
DROP TABLE `admin_audit`;
--> statement-breakpoint
ALTER TABLE `__new_admin_audit` RENAME TO `admin_audit`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `admin_audit_created_at_idx` ON `admin_audit`(`created_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `admin_audit_context_request_id_idx` ON `admin_audit`(`context_request_id`);
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
