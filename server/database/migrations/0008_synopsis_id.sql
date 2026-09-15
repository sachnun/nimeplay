ALTER TABLE `anime` RENAME COLUMN `synopsis` TO `synopsis_en`;--> statement-breakpoint
ALTER TABLE `anime` ADD `synopsis_id` text;
