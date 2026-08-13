-- §2.2 context columns (SQLite: nullable / with DEFAULT, excluded from hash payload).

ALTER TABLE `admin_audit` ADD `schema_version` INTEGER NOT NULL DEFAULT 1;
ALTER TABLE `admin_audit` ADD `actor_name` TEXT;
ALTER TABLE `admin_audit` ADD `actor_json` TEXT;
ALTER TABLE `admin_audit` ADD `context_ip` TEXT;
ALTER TABLE `admin_audit` ADD `context_user_agent` TEXT;
ALTER TABLE `admin_audit` ADD `context_request_id` TEXT;
ALTER TABLE `admin_audit` ADD `context_method` TEXT;
ALTER TABLE `admin_audit` ADD `context_path` TEXT;
ALTER TABLE `admin_audit` ADD `created_at` INTEGER NOT NULL DEFAULT (unixepoch());
ALTER TABLE `admin_audit` ADD `search_text` TEXT;

CREATE INDEX IF NOT EXISTS `admin_audit_created_at_idx` ON `admin_audit`(`created_at` DESC);
CREATE INDEX IF NOT EXISTS `admin_audit_context_request_id_idx` ON `admin_audit`(`context_request_id`);

-- SQLite FTS5 for full-text search (triggers keep the virtual table in sync).
CREATE VIRTUAL TABLE IF NOT EXISTS `admin_audit_fts` USING fts5(
  `entry_id` UNINDEXED,
  `user_email`,
  `action`,
  `target_id`,
  `detail`,
  content=`admin_audit`,
  content_rowid=`rowid`
);

-- Triggers to keep FTS index in sync with the main table.
CREATE TRIGGER IF NOT EXISTS `admin_audit_fts_insert` AFTER INSERT ON `admin_audit` BEGIN
  INSERT INTO `admin_audit_fts`(`rowid`, `entry_id`, `user_email`, `action`, `target_id`, `detail`)
  VALUES (new.rowid, new.id, new.userEmail, new.action, new.targetId, new.detail);
END;

CREATE TRIGGER IF NOT EXISTS `admin_audit_fts_delete` AFTER DELETE ON `admin_audit` BEGIN
  INSERT INTO `admin_audit_fts`(`admin_audit_fts`, `rowid`, `entry_id`, `user_email`, `action`, `target_id`, `detail`)
  VALUES ('delete', old.rowid, old.id, old.userEmail, old.action, old.targetId, old.detail);
END;

CREATE TRIGGER IF NOT EXISTS `admin_audit_fts_update` AFTER UPDATE ON `admin_audit` BEGIN
  INSERT INTO `admin_audit_fts`(`admin_audit_fts`, `rowid`, `entry_id`, `user_email`, `action`, `target_id`, `detail`)
  VALUES ('delete', old.rowid, old.id, old.userEmail, old.action, old.targetId, old.detail);
  INSERT INTO `admin_audit_fts`(`rowid`, `entry_id`, `user_email`, `action`, `target_id`, `detail`)
  VALUES (new.rowid, new.id, new.userEmail, new.action, new.targetId, new.detail);
END;
