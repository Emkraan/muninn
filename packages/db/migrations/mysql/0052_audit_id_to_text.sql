-- Same defect as the Postgres/SQLite dialects (see the postgresql 0019
-- migration for the full root-cause writeup): the Drizzle schema declares
-- admin_audit.id as varchar(64), but the live table was created (migration
-- 0048) as `int AUTO_INCREMENT PRIMARY KEY`, so writeAuditEntry's createId()
-- string insert fails.
--
-- This backfills existing integer ids as zero-padded 20-digit decimal strings,
-- which preserves ORDER BY id ordering (used by writeAuditEntry/
-- verifyAuditChain in packages/api/src/audit.ts) both among legacy rows and
-- against future cuid2 ids, which always start with a lowercase letter (ASCII
-- digits < letters).
--
-- id is NOT part of the HMAC hash payload (prevHash|timestamp|userId|action|
-- targetId|detail in audit.ts computeHash), so no row's hash changes here.
--
-- AUTO_INCREMENT must be dropped before the primary key can be dropped, so the
-- id column is demoted to a plain INT first.

ALTER TABLE `admin_audit` ADD COLUMN `id_new` VARCHAR(64);
--> statement-breakpoint
UPDATE `admin_audit` SET `id_new` = LPAD(CAST(`id` AS CHAR), 20, '0');
--> statement-breakpoint
ALTER TABLE `admin_audit` MODIFY COLUMN `id` INT NOT NULL;
--> statement-breakpoint
ALTER TABLE `admin_audit` DROP PRIMARY KEY;
--> statement-breakpoint
ALTER TABLE `admin_audit` DROP COLUMN `id`;
--> statement-breakpoint
ALTER TABLE `admin_audit` CHANGE COLUMN `id_new` `id` VARCHAR(64) NOT NULL;
--> statement-breakpoint
ALTER TABLE `admin_audit` ADD PRIMARY KEY (`id`);
