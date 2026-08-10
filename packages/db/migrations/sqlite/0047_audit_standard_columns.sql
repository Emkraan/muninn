-- admin-hub-standard §2.1: add outcome, resourceType, resourceId, errorMessage
-- to the admin_audit table.
--
-- These columns are NOT part of the HMAC hash payload (which covers
-- prevHash|timestamp|userId|action|targetId|detail). Adding them here
-- extends the schema without invalidating any existing chain entries.
--
-- All four columns are nullable so existing rows (pre-0047) remain valid.
-- New writes should populate outcome ("success"|"failure") and resourceType
-- at a minimum.

ALTER TABLE `admin_audit` ADD `outcome` text;
ALTER TABLE `admin_audit` ADD `resourceType` text;
ALTER TABLE `admin_audit` ADD `resourceId` text;
ALTER TABLE `admin_audit` ADD `errorMessage` text;
