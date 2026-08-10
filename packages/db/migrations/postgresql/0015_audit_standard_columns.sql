-- admin-hub-standard §2.1: add outcome, resourceType, resourceId, errorMessage
-- to the admin_audit table.
--
-- These columns are NOT part of the HMAC hash payload (which covers
-- prevHash|timestamp|userId|action|targetId|detail). Adding them here
-- extends the schema without invalidating any existing chain entries.
--
-- All four columns are nullable so existing rows (pre-0015) remain valid.
-- New writes should populate outcome ("success"|"failure") and resourceType
-- at a minimum.

ALTER TABLE "admin_audit" ADD COLUMN "outcome" varchar(16);
ALTER TABLE "admin_audit" ADD COLUMN "resourceType" varchar(64);
ALTER TABLE "admin_audit" ADD COLUMN "resourceId" varchar(64);
ALTER TABLE "admin_audit" ADD COLUMN "errorMessage" text;
