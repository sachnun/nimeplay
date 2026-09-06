CREATE INDEX IF NOT EXISTS `anime_title_idx` ON `anime` (`title`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `anime_metadata_retry_at_idx` ON `anime` (`metadata_retry_at`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `anime_metadata_attempts_idx` ON `anime` (`metadata_attempts`);
