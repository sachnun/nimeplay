PRAGMA defer_foreign_keys = ON;
PRAGMA foreign_keys = OFF;
UPDATE `episodes` SET `anime_slug` = 'otakudesu:' || `anime_slug`, `slug` = 'otakudesu:' || `slug`;
UPDATE `anime_genres` SET `anime_slug` = 'otakudesu:' || `anime_slug`;
UPDATE `anime` SET `slug` = 'otakudesu:' || `slug`;
PRAGMA foreign_keys = ON;