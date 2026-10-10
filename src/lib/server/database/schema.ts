import { sql } from 'drizzle-orm'
import {
  bigint,
  bigserial,
  customType,
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
import type { EpisodeData } from '../utils/sources/types'

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' })

export const genres = pgTable('genres', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const anime = pgTable(
  'anime',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    malId: integer('mal_id').notNull(),
    title: text('title'),
    posterKey: text('poster_key'),
    synopsis: text('synopsis'),
    rating: real('rating'),
    rank: integer('rank'),
    popularity: integer('popularity'),
    season: text('season'),
    year: integer('year'),
    status: text('status'),
    day: integer('day'),
    type: text('type'),
    studio: text('studio'),
    trailerId: text('trailer_id'),
    episodeCount: integer('episode_count').notNull().default(0),
    latestEpisode: integer('latest_episode'),
    latestEpisodeAt: timestamp('latest_episode_at', { withTimezone: true }),
    metadataSyncedAt: timestamp('metadata_synced_at', { withTimezone: true }),
    lastNewEpisodeAt: timestamp('last_new_episode_at', { withTimezone: true }),
    searchDoc: tsvector('search_doc'),
    extra: jsonb('extra').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('anime_mal_id_key').on(table.malId),
    index('anime_latest_episode_at_idx').on(table.latestEpisodeAt),
    index('anime_status_mal_id_idx').on(table.status, table.malId),
    index('anime_season_year_idx').on(table.season, table.year),
    index('anime_title_trgm_idx').using('gin', sql`${table.title} gin_trgm_ops`),
    index('anime_search_doc_idx').using('gin', table.searchDoc),
  ],
)

export const animeSources = pgTable(
  'anime_sources',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    animeId: bigint('anime_id', { mode: 'number' }).references(() => anime.id, { onDelete: 'cascade' }),
    source: text('source').notNull(),
    slug: text('slug').notNull(),
    status: text('status'),
    ongoingRank: integer('ongoing_rank'),
    metadataState: text('metadata_state'),
    metadataAttempts: integer('metadata_attempts').notNull().default(0),
    metadataCheckedAt: timestamp('metadata_checked_at', { withTimezone: true }),
    latestEpisodeAt: timestamp('latest_episode_at', { withTimezone: true }),
    metadataSyncedAt: timestamp('metadata_synced_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('anime_sources_source_slug_key').on(table.source, table.slug),
    index('anime_sources_anime_id_idx').on(table.animeId),
    index('anime_sources_status_idx').on(table.status),
    index('anime_sources_metadata_state_idx').on(table.metadataState),
    index('anime_sources_updated_at_idx').on(table.updatedAt),
  ],
)

export const animeGenres = pgTable(
  'anime_genres',
  {
    animeId: bigint('anime_id', { mode: 'number' })
      .notNull()
      .references(() => anime.id, { onDelete: 'cascade' }),
    genreId: integer('genre_id')
      .notNull()
      .references(() => genres.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    primaryKey({ columns: [table.animeId, table.genreId] }),
    index('anime_genres_genre_id_idx').on(table.genreId),
  ],
)

export const episodes = pgTable(
  'episodes',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sourceId: bigint('source_id', { mode: 'number' })
      .notNull()
      .references(() => animeSources.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    releaseDate: text('release_date'),
    cache: jsonb('cache').$type<EpisodeData>(),
    cachedAt: timestamp('cached_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    uniqueIndex('episodes_source_id_number_key').on(table.sourceId, table.number),
    uniqueIndex('episodes_slug_key').on(table.slug),
  ],
)

export const characters = pgTable(
  'characters',
  {
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
  },
  table => [uniqueIndex('characters_anime_id_name_key').on(table.animeId, table.name)],
)

export const media = pgTable(
  'media',
  {
    key: text('key').primaryKey(),
    sourceUrl: text('source_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [uniqueIndex('media_source_url_key').on(table.sourceUrl)],
)

export const appState = pgTable('app_state', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const jobs = pgTable(
  'jobs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('waiting'),
    priority: integer('priority').notNull().default(0),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    dedupeKey: text('dedupe_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [
    index('jobs_pick_idx').on(table.status, table.priority, table.runAt),
    uniqueIndex('jobs_dedupe_key').on(table.dedupeKey).where(sql`status in ('waiting', 'active')`),
  ],
)

export type AnimeSourceRow = typeof animeSources.$inferSelect
export type JobRow = typeof jobs.$inferSelect
