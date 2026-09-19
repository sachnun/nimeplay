import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const genres = pgTable('genres', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const anime = pgTable('anime', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  slug: text('slug').notNull().unique(),
  malId: integer('mal_id'),
  title: text('title').notNull(),
  posterKey: text('poster_key'),
  synopsis: text('synopsis'),
  rating: real('rating'),
  rank: integer('rank'),
  popularity: integer('popularity'),
  season: text('season'),
  year: integer('year'),
  status: text('status'),
  type: text('type'),
  day: text('day'),
  studio: text('studio'),
  source: text('source'),
  trailerId: text('trailer_id'),
  sourceUrl: text('source_url'),
  episodeCount: integer('episode_count').notNull().default(0),
  latestEpisode: integer('latest_episode'),
  latestEpisodeAt: timestamp('latest_episode_at', { withTimezone: true }),
  ongoingRank: integer('ongoing_rank'),
  metadataSyncedAt: timestamp('metadata_synced_at', { withTimezone: true }),
  metadataAttempts: integer('metadata_attempts').notNull().default(0),
  metadataLastError: text('metadata_last_error'),
  metadataRetryAt: timestamp('metadata_retry_at', { withTimezone: true }),
  lastNewEpisodeAt: timestamp('last_new_episode_at', { withTimezone: true }),
  extra: jsonb('extra').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('anime_mal_id_key').on(table.malId),
  index('anime_title_idx').on(table.title),
  index('anime_updated_at_idx').on(table.updatedAt),
  index('anime_latest_episode_at_idx').on(table.latestEpisodeAt),
  index('anime_status_idx').on(table.status),
  index('anime_status_mal_id_idx').on(table.status, table.malId),
  index('anime_metadata_retry_at_idx').on(table.metadataRetryAt),
  index('anime_metadata_attempts_idx').on(table.metadataAttempts),
  index('anime_season_year_idx').on(table.season, table.year),
  index('anime_fts_idx').using('gin', sql`to_tsvector('simple', ${table.title})`),
])

export const animeGenres = pgTable('anime_genres', {
  animeId: bigint('anime_id', { mode: 'number' })
    .notNull()
    .references(() => anime.id, { onDelete: 'cascade' }),
  genreId: integer('genre_id')
    .notNull()
    .references(() => genres.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  primaryKey({ columns: [table.animeId, table.genreId] }),
  index('anime_genres_genre_id_idx').on(table.genreId),
])

export const episodes = pgTable('episodes', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  animeId: bigint('anime_id', { mode: 'number' })
    .notNull()
    .references(() => anime.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  releaseDate: text('release_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('episodes_anime_id_number_key').on(table.animeId, table.number),
  uniqueIndex('episodes_slug_key').on(table.slug),
  index('episodes_anime_id_idx').on(table.animeId),
])

export const characters = pgTable('characters', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  animeId: bigint('anime_id', { mode: 'number' })
    .notNull()
    .references(() => anime.id, { onDelete: 'cascade' }),
  malId: integer('mal_id'),
  name: text('name').notNull(),
  role: text('role'),
  imageKey: text('image_key'),
  voiceActorName: text('voice_actor_name'),
  voiceActorKey: text('voice_actor_key'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('characters_anime_id_name_key').on(table.animeId, table.name),
  index('characters_anime_id_idx').on(table.animeId),
])

export const media = pgTable('media', {
  key: text('key').primaryKey(),
  sourceUrl: text('source_url').notNull(),
  contentType: text('content_type'),
  byteSize: integer('byte_size'),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
  mirroredAt: timestamp('mirrored_at', { withTimezone: true }),
  nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('media_status_idx').on(table.status, table.nextRetryAt),
  uniqueIndex('media_source_url_key').on(table.sourceUrl),
])

export const appState = pgTable('app_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const animeRelations = relations(anime, ({ many }) => ({
  episodes: many(episodes),
  genres: many(animeGenres),
  characters: many(characters),
}))

export const genresRelations = relations(genres, ({ many }) => ({
  anime: many(animeGenres),
}))

export const animeGenresRelations = relations(animeGenres, ({ one }) => ({
  anime: one(anime, { fields: [animeGenres.animeId], references: [anime.id] }),
  genre: one(genres, { fields: [animeGenres.genreId], references: [genres.id] }),
}))

export const charactersRelations = relations(characters, ({ one }) => ({
  anime: one(anime, { fields: [characters.animeId], references: [anime.id] }),
}))

export type AnimeRow = typeof anime.$inferSelect
export type EpisodeRow = typeof episodes.$inferSelect
export type GenreRow = typeof genres.$inferSelect
export type CharacterRow = typeof characters.$inferSelect
export type MediaRow = typeof media.$inferSelect
