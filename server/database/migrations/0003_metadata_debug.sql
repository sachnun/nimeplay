ALTER TABLE `anime` ADD `metadata_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `anime` ADD `metadata_last_error` text;--> statement-breakpoint
ALTER TABLE `anime` ADD `metadata_retry_at` integer;
