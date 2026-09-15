UPDATE `anime` SET `synopsis_en` = `synopsis_id` WHERE `synopsis_id` IS NOT NULL AND TRIM(`synopsis_id`) != '';--> statement-breakpoint
ALTER TABLE `anime` DROP COLUMN `synopsis_id`;--> statement-breakpoint
ALTER TABLE `anime` RENAME COLUMN `synopsis_en` TO `synopsis`;
