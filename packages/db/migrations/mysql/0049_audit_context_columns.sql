-- §2.1 standard columns (outcome, resourceType, resourceId, errorMessage) were
-- added to the schema in PR #126 (schema-only for MySQL). This migration applies
-- the actual DDL so existing MySQL deployments gain the columns.
--
-- §2.2 context columns are also added here (excluded from HMAC hash payload).

ALTER TABLE `admin_audit`
  ADD COLUMN `outcome` VARCHAR(16),
  ADD COLUMN `resourceType` VARCHAR(64),
  ADD COLUMN `resourceId` VARCHAR(64),
  ADD COLUMN `errorMessage` TEXT,
  ADD COLUMN `schema_version` INT NOT NULL DEFAULT 1,
  ADD COLUMN `actor_name` VARCHAR(256),
  ADD COLUMN `actor_json` TEXT,
  ADD COLUMN `context_ip` VARCHAR(45),
  ADD COLUMN `context_user_agent` VARCHAR(240),
  ADD COLUMN `context_request_id` VARCHAR(64),
  ADD COLUMN `context_method` VARCHAR(10),
  ADD COLUMN `context_path` VARCHAR(2048),
  ADD COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN `search_text` TEXT,
  ADD INDEX `admin_audit_created_at_idx` (`created_at` DESC),
  ADD INDEX `admin_audit_context_request_id_idx` (`context_request_id`);
