ALTER TABLE `apiKey` ADD `name` varchar(128) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `apiKey` ADD `scopes` text;--> statement-breakpoint
ALTER TABLE `apiKey` ADD `expires_at` timestamp;--> statement-breakpoint
ALTER TABLE `apiKey` ADD `created_at` timestamp DEFAULT (now()) NOT NULL;--> statement-breakpoint
ALTER TABLE `apiKey` ADD `last_used_at` timestamp;