import { relations, sql } from 'drizzle-orm'
import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const animeKindEnum = pgEnum('anime_kind', ['ONGOING', 'COMPLETED'])
export const syncStatusEnum = pgEnum('sync_status', ['PENDING', 'SYNCED', 'FAILED'])
export const syncRunTypeEnum = pgEnum('sync_run_type', ['LATEST', 'CATALOG'])
export const syncRunStatusEnum = pgEnum('sync_run_status', ['RUNNING', 'SUCCESS', 'FAILED'])

export const malAnime = pgTable('mal_anime', {
  malId: integer('mal_id').primaryKey(),
  title: text('title').notNull(),
  titleEnglish: text('title_english'),
  titleJapanese: text('title_japanese'),
  synopsis: text('synopsis'),
  background: text('background'),
  imageUrl: text('image_url').notNull().default(''),
  trailerEmbedUrl: text('trailer_embed_url'),
  score: text('score').notNull().default(''),
  rank: integer('rank'),
  popularity: integer('popularity'),
  rating: text('rating').notNull().default(''),
  season: text('season'),
  year: integer('year'),
  type: text('type').notNull().default(''),
  status: text('status').notNull().default(''),
  episodes: integer('episodes'),
  duration: text('duration').notNull().default(''),
  studios: text('studios').array().notNull().default(sql`ARRAY[]::text[]`),
  characters: jsonb('characters').$type<{
    name: string
    imageUrl: string
    role: 'Main' | 'Supporting'
    voiceActor?: { name: string; imageUrl: string }
  }[]>().notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  titleIdx: index('mal_anime_title_idx').on(table.title),
}))

export const otakudesuAnime = pgTable('otakudesu_anime', {
  slug: text('slug').primaryKey(),
  malId: integer('mal_id').references(() => malAnime.malId, { onDelete: 'set null' }),
  rawTitle: text('raw_title').notNull(),
  title: text('title').notNull(),
  japaneseTitle: text('japanese_title').notNull().default(''),
  sourceSynopsis: text('source_synopsis').notNull().default(''),
  sourceScore: text('source_score').notNull().default(''),
  sourceProducer: text('source_producer').notNull().default(''),
  sourceType: text('source_type').notNull().default(''),
  sourceStatus: text('source_status').notNull().default(''),
  sourceTotalEpisode: text('source_total_episode').notNull().default(''),
  sourceDuration: text('source_duration').notNull().default(''),
  sourceReleaseDate: text('source_release_date').notNull().default(''),
  sourceStudio: text('source_studio').notNull().default(''),
  latestEpisode: text('latest_episode').notNull().default(''),
  latestDay: text('latest_day').notNull().default(''),
  latestDate: text('latest_date').notNull().default(''),
  latestRating: text('latest_rating').notNull().default(''),
  isOngoing: boolean('is_ongoing').notNull().default(false),
  isCompleted: boolean('is_completed').notNull().default(false),
  syncStatus: syncStatusEnum('sync_status').notNull().default('PENDING'),
  syncError: text('sync_error'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  malIdx: index('otakudesu_anime_mal_idx').on(table.malId),
  titleIdx: index('otakudesu_anime_title_idx').on(table.title),
  syncedIdx: index('otakudesu_anime_synced_idx').on(table.syncStatus),
}))

export const genres = pgTable('genres', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
})

export const animeGenres = pgTable('anime_genres', {
  animeSlug: text('anime_slug').notNull().references(() => otakudesuAnime.slug, { onDelete: 'cascade' }),
  genreSlug: text('genre_slug').notNull().references(() => genres.slug, { onDelete: 'cascade' }),
}, (table) => ({
  pk: primaryKey({ columns: [table.animeSlug, table.genreSlug] }),
  genreIdx: index('anime_genres_genre_idx').on(table.genreSlug),
}))

export const animeEpisodes = pgTable('anime_episodes', {
  slug: text('slug').primaryKey(),
  animeSlug: text('anime_slug').notNull().references(() => otakudesuAnime.slug, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  date: text('date').notNull().default(''),
  episodeNumber: integer('episode_number'),
  sortOrder: integer('sort_order').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  animeIdx: index('anime_episodes_anime_idx').on(table.animeSlug),
  animeOrderIdx: index('anime_episodes_anime_order_idx').on(table.animeSlug, table.sortOrder),
}))

export const latestFeedItems = pgTable('latest_feed_items', {
  id: serial('id').primaryKey(),
  kind: animeKindEnum('kind').notNull(),
  animeSlug: text('anime_slug').notNull().references(() => otakudesuAnime.slug, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  episode: text('episode').notNull().default(''),
  day: text('day').notNull().default(''),
  date: text('date').notNull().default(''),
  rating: text('rating').notNull().default(''),
  syncedAt: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueKindAnime: uniqueIndex('latest_feed_kind_anime_unique').on(table.kind, table.animeSlug),
  kindPositionIdx: index('latest_feed_kind_position_idx').on(table.kind, table.position),
}))

export const syncRuns = pgTable('sync_runs', {
  id: serial('id').primaryKey(),
  type: syncRunTypeEnum('type').notNull(),
  status: syncRunStatusEnum('status').notNull().default('RUNNING'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
  processed: integer('processed').notNull().default(0),
  succeeded: integer('succeeded').notNull().default(0),
  failed: integer('failed').notNull().default(0),
  message: text('message'),
})

export const malAnimeRelations = relations(malAnime, ({ many }) => ({
  otakudesuAnime: many(otakudesuAnime),
}))

export const otakudesuAnimeRelations = relations(otakudesuAnime, ({ one, many }) => ({
  mal: one(malAnime, {
    fields: [otakudesuAnime.malId],
    references: [malAnime.malId],
  }),
  episodes: many(animeEpisodes),
  animeGenres: many(animeGenres),
  latestFeedItems: many(latestFeedItems),
}))

export const animeGenresRelations = relations(animeGenres, ({ one }) => ({
  anime: one(otakudesuAnime, {
    fields: [animeGenres.animeSlug],
    references: [otakudesuAnime.slug],
  }),
  genre: one(genres, {
    fields: [animeGenres.genreSlug],
    references: [genres.slug],
  }),
}))

export const genresRelations = relations(genres, ({ many }) => ({
  animeGenres: many(animeGenres),
}))

export const animeEpisodesRelations = relations(animeEpisodes, ({ one }) => ({
  anime: one(otakudesuAnime, {
    fields: [animeEpisodes.animeSlug],
    references: [otakudesuAnime.slug],
  }),
}))

export const latestFeedItemsRelations = relations(latestFeedItems, ({ one }) => ({
  anime: one(otakudesuAnime, {
    fields: [latestFeedItems.animeSlug],
    references: [otakudesuAnime.slug],
  }),
}))

export type AnimeKind = typeof animeKindEnum.enumValues[number]
export type SyncRunType = typeof syncRunTypeEnum.enumValues[number]
