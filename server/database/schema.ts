import { relations, sql } from 'drizzle-orm'
import {
  customType,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'
import type { MalCharacter } from '../utils/mal'

function jsonText<T>() {
  return customType<{ data: T, driverData: string }>({
    dataType() {
      return 'text'
    },
    toDriver(value: T) {
      return JSON.stringify(value)
    },
    fromDriver(value: string): T {
      try {
        return JSON.parse(value) as T
      }
      catch {
        return [] as T
      }
    },
  })
}

export const genres = sqliteTable('genres', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
})

export const anime = sqliteTable('anime', {
  slug: text('slug').primaryKey(),
  malId: integer('mal_id'),
  title: text('title').notNull(),
  poster: text('poster'),
  synopsis: text('synopsis'),
  synopsisId: text('synopsis_id'),
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
  characters: jsonText<MalCharacter[]>()('characters').notNull().default(sql`'[]'`),
  sourceUrl: text('source_url'),
  /** Parsed date of the newest episode, derived from the Otakudesu detail page. */
  latestEpisodeAt: integer('latest_episode_at', { mode: 'timestamp_ms' }),
  /** Position in the Otakudesu ongoing list at the last scrape (upstream order). */
  ongoingRank: integer('ongoing_rank'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
  metadataSyncedAt: integer('metadata_synced_at', { mode: 'timestamp_ms' }),
}, table => [
  uniqueIndex('anime_mal_id_key').on(table.malId),
  index('anime_updated_at_idx').on(table.updatedAt),
  index('anime_latest_episode_at_idx').on(table.latestEpisodeAt),
  index('anime_status_idx').on(table.status),
])

export const animeGenres = sqliteTable('anime_genres', {
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

export const episodes = sqliteTable('episodes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  animeSlug: text('anime_slug')
    .notNull()
    .references(() => anime.slug, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  number: integer('number').notNull(),
  title: text('title').notNull(),
  releaseDate: text('release_date'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().defaultNow(),
}, table => [
  uniqueIndex('episodes_anime_slug_number_key').on(table.animeSlug, table.number),
  uniqueIndex('episodes_slug_key').on(table.slug),
  index('episodes_anime_slug_idx').on(table.animeSlug),
])

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
