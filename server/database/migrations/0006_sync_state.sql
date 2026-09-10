CREATE TABLE IF NOT EXISTS `sync_state` (
  `key` text PRIMARY KEY NOT NULL,
  `owner` text,
  `locked_until` integer,
  `updated_at` integer NOT NULL DEFAULT (strftime('%s','now') * 1000)
);
