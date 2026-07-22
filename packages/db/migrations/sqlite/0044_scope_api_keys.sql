ALTER TABLE `apiKey` ADD `name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `apiKey` ADD `scopes` text;--> statement-breakpoint
ALTER TABLE `apiKey` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `apiKey` ADD `created_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `apiKey` ADD `last_used_at` integer;