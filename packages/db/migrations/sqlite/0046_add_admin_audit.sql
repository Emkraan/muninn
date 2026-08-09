CREATE TABLE `admin_audit` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`timestamp` integer NOT NULL,
	`userId` text NOT NULL,
	`userEmail` text NOT NULL,
	`action` text NOT NULL,
	`targetId` text,
	`detail` text,
	`prevHash` text,
	`hash` text NOT NULL
);
