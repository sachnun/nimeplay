import { relations } from 'drizzle-orm'
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  unique,
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
  rating: numeric('rating', { precision: 4, scale: 2 }),
  rank: integer('rank'),
  popularity: integer('popularity'),
  season: text('season'),
  status: text('status'),
  type: text('type'),
  day: text('day'),
  trailerId: text('trailer_id'),
  characters: jsonb('characters').$type<MalCharacter[]>().notNull().default([]),
  sourceUrl: text('source_url'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  metadataSyncedAt: timestamp('metadata_synced_at', { withTimezone: true }),
}, table => [
  unique('anime_mal_id_key').on(table.malId),
  index('anime_updated_at_idx').on(table.updatedAt),
  index('anime_status_idx').on(table.status),
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
  unique('episodes_anime_slug_number_key').on(table.animeSlug, table.number),
  unique('episodes_slug_key').on(table.slug),
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
