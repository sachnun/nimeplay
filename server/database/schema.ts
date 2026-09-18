import { relations, sql } from 'drizzle-orm'
import {
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
import type { MalCharacter } from '../utils/mal'

export const genres = pgTable('genres', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
})

export const anime = pgTable('anime', {
  slug: text('slug').primaryKey(),
  malId: integer('mal_id'),
  title: text('title').notNull(),
  poster: text('poster'),
  synopsis: text('synopsis'),
  rating: real('rating'),
  rank: integer('rank'),
  popularity: integer('popularity'),
  season: text('season'),
  status: text('status'),
  type: text('type'),
  day: text('day'),
  studio: text('studio'),
  source: text('source'),
  trailerId: text('trailer_id'),
  characters: jsonb('characters').$type<MalCharacter[]>().notNull().default([]),
  sourceUrl: text('source_url'),
  episodeCount: integer('episode_count').notNull().default(0),
  latestEpisode: integer('latest_episode'),
  latestEpisodeAt: timestamp('latest_episode_at', { withTimezone: true }),
  ongoingRank: integer('ongoing_rank'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  metadataSyncedAt: timestamp('metadata_synced_at', { withTimezone: true }),
  lastNewEpisodeAt: timestamp('last_new_episode_at', { withTimezone: true }),
  metadataAttempts: integer('metadata_attempts').notNull().default(0),
  metadataLastError: text('metadata_last_error'),
  metadataRetryAt: timestamp('metadata_retry_at', { withTimezone: true }),
}, table => [
  uniqueIndex('anime_mal_id_key').on(table.malId),
  index('anime_title_idx').on(table.title),
  index('anime_updated_at_idx').on(table.updatedAt),
  index('anime_latest_episode_at_idx').on(table.latestEpisodeAt),
  index('anime_status_idx').on(table.status),
  index('anime_status_mal_id_idx').on(table.status, table.malId),
  index('anime_metadata_retry_at_idx').on(table.metadataRetryAt),
  index('anime_metadata_attempts_idx').on(table.metadataAttempts),
  index('anime_fts_idx').using('gin', sql`to_tsvector('simple', ${table.title})`),
])

export const animeGenres = pgTable('anime_genres', {
  animeSlug: text('anime_slug')
    .notNull()
    .references(() => anime.slug, { onDelete: 'cascade' }),
  genreId: integer('genre_id')
    .notNull()
    .references(() => genres.id, { onDelete: 'cascade' }),
}, table => [
  primaryKey({ columns: [table.animeSlug, table.genreId] }),
  index('anime_genres_genre_id_idx').on(table.genreId),
])

export const episodes = pgTable('episodes', {
  id: serial('id').primaryKey(),
  animeSlug: text('anime_slug')
    .notNull()
    .references(() => anime.slug, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  releaseDate: text('release_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  uniqueIndex('episodes_anime_slug_number_key').on(table.animeSlug, table.number),
  uniqueIndex('episodes_slug_key').on(table.slug),
  index('episodes_anime_slug_idx').on(table.animeSlug),
])

export const appState = pgTable('app_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const animeRelations = relations(anime, ({ many }) => ({
  episodes: many(episodes),
  genres: many(animeGenres),
}))

export const genresRelations = relations(genres, ({ many }) => ({
  anime: many(animeGenres),
}))

export const animeGenresRelations = relations(animeGenres, ({ one }) => ({
  anime: one(anime, { fields: [animeGenres.animeSlug], references: [anime.slug] }),
  genre: one(genres, { fields: [animeGenres.genreId], references: [genres.id] }),
}))

export type AnimeRow = typeof anime.$inferSelect
export type EpisodeRow = typeof episodes.$inferSelect
export type GenreRow = typeof genres.$inferSelect
