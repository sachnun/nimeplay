ALTER TABLE `anime` ADD `episode_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `anime` ADD `latest_episode` integer;--> statement-breakpoint
UPDATE `anime` SET `episode_count` = (SELECT COUNT(*) FROM `episodes` WHERE `episodes`.`anime_slug` = `anime`.`slug`), `latest_episode` = (SELECT MAX(`number`) FROM `episodes` WHERE `episodes`.`anime_slug` = `anime`.`slug`);
