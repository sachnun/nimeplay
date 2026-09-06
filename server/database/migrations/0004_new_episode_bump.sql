ALTER TABLE `anime` ADD `last_new_episode_at` integer;--> statement-breakpoint
UPDATE `anime` SET `last_new_episode_at` = `latest_episode_at` WHERE `latest_episode_at` IS NOT NULL;
