CREATE TABLE "admin_audit" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
	"timestamp" timestamp NOT NULL,
	"userId" varchar(64) NOT NULL,
	"userEmail" varchar(256) NOT NULL,
	"action" varchar(128) NOT NULL,
	"targetId" varchar(64),
	"detail" text,
	"prevHash" varchar(128),
	"hash" varchar(128) NOT NULL
);
