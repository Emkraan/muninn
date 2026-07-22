ALTER TABLE "apiKey" ADD COLUMN "name" varchar(128) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "apiKey" ADD COLUMN "scopes" text;--> statement-breakpoint
ALTER TABLE "apiKey" ADD COLUMN "expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "apiKey" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "apiKey" ADD COLUMN "last_used_at" timestamp;