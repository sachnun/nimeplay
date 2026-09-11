CREATE VIRTUAL TABLE `anime_fts` USING fts5(`title`, content=`anime`, content_rowid=`rowid`);--> statement-breakpoint
INSERT INTO `anime_fts`(`rowid`, `title`) SELECT `rowid`, `title` FROM `anime`;--> statement-breakpoint
CREATE TRIGGER `anime_fts_insert` AFTER INSERT ON `anime` BEGIN INSERT INTO `anime_fts`(`rowid`, `title`) VALUES (new.`rowid`, new.`title`); END;--> statement-breakpoint
CREATE TRIGGER `anime_fts_delete` AFTER DELETE ON `anime` BEGIN INSERT INTO `anime_fts`(`anime_fts`, `rowid`, `title`) VALUES ('delete', old.`rowid`, old.`title`); END;--> statement-breakpoint
CREATE TRIGGER `anime_fts_update` AFTER UPDATE OF `title` ON `anime` BEGIN INSERT INTO `anime_fts`(`anime_fts`, `rowid`, `title`) VALUES ('delete', old.`rowid`, old.`title`); INSERT INTO `anime_fts`(`rowid`, `title`) VALUES (new.`rowid`, new.`title`); END;
