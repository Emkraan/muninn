ALTER TABLE `custom_widget_secret` DROP FOREIGN KEY `cw_secret_definition_id_cw_definition_id_fk`;
--> statement-breakpoint
ALTER TABLE `custom_widget_secret` ADD CONSTRAINT `custom_widget_secret_definition_id_custom_widget_definition_id_fk` FOREIGN KEY (`definition_id`) REFERENCES `custom_widget_definition`(`id`) ON DELETE cascade ON UPDATE no action;