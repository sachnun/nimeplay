CREATE TABLE `anime` (
	`slug` text PRIMARY KEY NOT NULL,
	`mal_id` integer,
	`title` text NOT NULL,
	`poster` text,
	`synopsis` text,
	`rating` real,
	`rank` integer,
	`popularity` integer,
	`season` text,
	`status` text,
	`type` text,
	`day` text,
	`studio` text,
	`source` text,
	`trailer_id` text,
	`characters` text DEFAULT '[]' NOT NULL,
	`source_url` text,
	`latest_episode_at` integer,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`metadata_synced_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `anime_mal_id_key` ON `anime` (`mal_id`);--> statement-breakpoint
CREATE INDEX `anime_updated_at_idx` ON `anime` (`updated_at`);--> statement-breakpoint
CREATE INDEX `anime_latest_episode_at_idx` ON `anime` (`latest_episode_at`);--> statement-breakpoint
CREATE INDEX `anime_status_idx` ON `anime` (`status`);--> statement-breakpoint
CREATE TABLE `anime_genres` (
	`anime_slug` text NOT NULL,
	`genre_id` integer NOT NULL,
	PRIMARY KEY(`anime_slug`, `genre_id`),
	FOREIGN KEY (`anime_slug`) REFERENCES `anime`(`slug`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`genre_id`) REFERENCES `genres`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `anime_genres_genre_id_idx` ON `anime_genres` (`genre_id`);--> statement-breakpoint
CREATE TABLE `episodes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`anime_slug` text NOT NULL,
	`slug` text NOT NULL,
	`number` integer NOT NULL,
	`title` text NOT NULL,
	`release_date` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`anime_slug`) REFERENCES `anime`(`slug`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_anime_slug_number_key` ON `episodes` (`anime_slug`,`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `episodes_slug_key` ON `episodes` (`slug`);--> statement-breakpoint
CREATE INDEX `episodes_anime_slug_idx` ON `episodes` (`anime_slug`);--> statement-breakpoint
CREATE TABLE `genres` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `genres_slug_unique` ON `genres` (`slug`);