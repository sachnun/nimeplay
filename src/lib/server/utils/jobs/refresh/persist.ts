import { and, eq, inArray, sql } from 'drizzle-orm'
import type { AnimeSourceRow } from '../../../database/schema'
import { anime, animeGenres, animeSources, characters, episodes, genres } from '../../../database/schema'
import { db, resultRows } from '../../db'
import { warn } from '../../log'
import { fetchMalAnime } from '../../mal'
import { translateSynopsis } from '../../mal/synopsis'
import { normalizeTitleKey } from '../../mal/title'
import type { MalAnime } from '../../mal/types'
import { isValidMediaKey, type MediaRef, mediaRef } from '../../media'
import { ingestMedia } from '../../media/ingest'
import type { AnimeSource } from '../../sources/types'
import { chunkValues, resolveEpisodeNumber } from './util'

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export async function recordMetadataFailure(sourceRowId: number, slug: string, message: string): Promise<void> {
  warn(`[metadata] failed ${slug}`, { error: message })
  await db()
    .update(animeSources)
    .set({
      metadataState: 'unresolved',
      metadataAttempts: sql`${animeSources.metadataAttempts} + 1`,
      metadataCheckedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(animeSources.id, sourceRowId))
}

export async function getSourceRow(sourceId: string, vendorSlug: string): Promise<AnimeSourceRow | null> {
  const [row] = await db()
    .select()
    .from(animeSources)
    .where(and(eq(animeSources.source, sourceId), eq(animeSources.slug, vendorSlug)))
    .limit(1)
  return row ?? null
}

const EPISODE_JUNK = /pembatas|^\s*[=\-–—|+]+/i

interface EpisodeRow {
  entry: { title: string; slug: string; date: string }
  number: number
  slug: string
}

interface StoredEpisode {
  id: number
  slug: string
  number: number
  title: string
}

function episodeRows(source: AnimeSource, list: { title: string; slug: string; date: string }[]): EpisodeRow[] {
  const seenNumbers = new Set<number>()
  const seenSlugs = new Set<string>()
  const rows: EpisodeRow[] = []
  for (const entry of list) {
    const number = resolveEpisodeNumber(entry)
    if (number === null || EPISODE_JUNK.test(entry.title)) continue
    const slug = `${source.id}:${entry.slug}`
    if (seenNumbers.has(number) || seenSlugs.has(slug)) continue
    seenNumbers.add(number)
    seenSlugs.add(slug)
    rows.push({ entry, number, slug })
  }
  return rows
}

const EPISODE_GAP = 3

export function staleEpisodeIds(stored: StoredEpisode[], rows: EpisodeRow[]): number[] {
  if (rows.length === 0) return []
  const numberBySlug = new Map(rows.map(row => [row.slug, row.number]))
  const slugByNumber = new Map(rows.map(row => [row.number, row.slug]))
  const maxListed = rows.reduce((max, row) => Math.max(max, row.number), 0)
  const stale: number[] = []
  for (const row of stored) {
    const listed = numberBySlug.get(row.slug)
    if (listed === row.number) continue
    const owner = slugByNumber.get(row.number)
    if (listed !== undefined) stale.push(row.id)
    else if (owner !== undefined && owner !== row.slug) stale.push(row.id)
    else if (row.number > maxListed + EPISODE_GAP) stale.push(row.id)
  }
  return stale
}

async function pruneEpisodes(sourceId: number, rows: EpisodeRow[]): Promise<void> {
  if (rows.length === 0) return
  const stored = await db()
    .select({ id: episodes.id, slug: episodes.slug, number: episodes.number, title: episodes.title })
    .from(episodes)
    .where(eq(episodes.sourceId, sourceId))
  for (const chunk of chunkValues(staleEpisodeIds(stored, rows), 200)) {
    await db().delete(episodes).where(inArray(episodes.id, chunk))
  }
}

export async function upsertEpisodes(
  source: AnimeSource,
  sourceId: number,
  list: { title: string; slug: string; date: string }[],
): Promise<void> {
  const rows = episodeRows(source, list)
  await pruneEpisodes(sourceId, rows)

  const client = db()
  for (const chunk of chunkValues(rows, 15)) {
    await client
      .insert(episodes)
      .values(
        chunk.map(row => ({
          sourceId,
          slug: row.slug,
          number: row.number,
          title: row.entry.title,
          releaseDate: row.entry.date || null,
        })),
      )
      .onConflictDoNothing()
  }
}

export async function syncAnimeAggregate(animeId: number): Promise<void> {
  const client = db()
  await client.execute(sql`
    update anime a set
      episode_count = coalesce(e.count, 0),
      latest_episode = e.max,
      updated_at = now()
    from (
      select count(distinct ep.number) as count, max(ep.number) as max
      from episodes ep
      join anime_sources s on s.id = ep.source_id
      where s.anime_id = ${animeId}
    ) e
    where a.id = ${animeId}
  `)
  await client.execute(sql`
    update anime a set
      latest_episode_at = greatest(a.latest_episode_at, s.latest_at),
      updated_at = now()
    from (
      select max(latest_episode_at) as latest_at
      from anime_sources
      where anime_id = ${animeId}
    ) s
    where a.id = ${animeId}
  `)
}

async function syncGenres(animeId: number, names: string[]) {
  if (names.length === 0) return

  const rows = names.map(name => ({ slug: slugify(name), name }))
  const wantedSlugs = [...new Set(rows.map(row => row.slug))]

  const client = db()
  for (const chunk of chunkValues(rows, 30)) {
    await client.insert(genres).values(chunk).onConflictDoNothing()
  }
  const stored = await db()
    .select({ id: genres.id, slug: genres.slug })
    .from(genres)
    .where(inArray(genres.slug, wantedSlugs))
  const bySlug = new Map(stored.map(genre => [genre.slug, genre.id]))

  const links = rows
    .map(row => bySlug.get(row.slug))
    .filter((id): id is number => id !== undefined)
    .map(id => ({ animeId, genreId: id }))

  await client.delete(animeGenres).where(eq(animeGenres.animeId, animeId))
  for (const chunk of chunkValues(links, 30)) {
    await client.insert(animeGenres).values(chunk).onConflictDoNothing()
  }
}

export async function upsertCanonicalAnime(mal: MalAnime): Promise<number> {
  const posterRef = mediaRef(mal.poster, 'posters')
  const characterRefs = mal.characters.map(c => mediaRef(c.imageUrl, 'characters'))
  const refs = [posterRef, ...characterRefs].filter((ref): ref is MediaRef => ref !== null && isValidMediaKey(ref.key))
  const mediaKeys = await ingestMedia(refs)
  const imageKey = (ref: MediaRef | null): string | null => (ref ? (mediaKeys.get(ref.sourceUrl) ?? ref.key) : null)

  const posterKey = imageKey(posterRef)
  const synopsisOriginal = mal.synopsis
  const synopsisTranslated = await translateSynopsis(synopsisOriginal)
  const values: typeof anime.$inferInsert = {
    malId: mal.malId,
    ...(mal.title ? { title: mal.title } : {}),
    ...(mal.type ? { type: mal.type } : {}),
    synopsis: synopsisTranslated ?? synopsisOriginal,
    ...(posterKey ? { posterKey } : {}),
    rating: mal.score,
    rank: mal.rank,
    popularity: mal.popularity,
    ...(mal.status ? { status: mal.status } : {}),
    season: mal.season,
    year: mal.year,
    day: mal.day,
    trailerId: mal.trailerId,
    studio: mal.studio,
    extra: {
      episodeTotal: mal.episodeTotal,
      titles: mal.titles,
      synopsisOriginal,
      ...(synopsisTranslated ? { synopsisLang: 'id' } : {}),
    },
    metadataSyncedAt: new Date(),
    updatedAt: new Date(),
  }

  const [row] = await db()
    .insert(anime)
    .values(values)
    .onConflictDoUpdate({
      target: anime.malId,
      set:
        mal.status === 'COMPLETED' && mal.episodeTotal != null
          ? {
              ...values,
              status: sql`case when ${anime.episodeCount} >= ${mal.episodeTotal} then 'COMPLETED' else 'ONGOING' end`,
            }
          : values,
    })
    .returning({ id: anime.id })
  const animeId = row?.id
  if (animeId === undefined) throw new Error('anime upsert returned no row')

  const characterRows = mal.characters.map((c, index) => ({
    animeId,
    malId: null,
    name: c.name,
    role: c.role,
    imageKey: imageKey(characterRefs[index] ?? null),
    voiceActorName: c.voiceActor?.name ?? null,
    voiceActorKey: null,
    sortOrder: index,
  }))

  await db().delete(characters).where(eq(characters.animeId, animeId))
  for (const chunk of chunkValues(characterRows, 50)) {
    await db().insert(characters).values(chunk).onConflictDoNothing()
  }
  await syncGenres(animeId, mal.genres)
  await refreshSearchDoc(animeId)
  return animeId
}

export async function refreshSearchDoc(animeId: number): Promise<void> {
  await db().execute(sql`
    update anime a set search_doc =
      setweight(to_tsvector('simple', coalesce(a.title, '')), 'A') ||
      setweight(to_tsvector('simple', coalesce((
        select string_agg(t.value, ' ') from jsonb_array_elements_text(a.extra -> 'titles') t(value)
      ), '')), 'A') ||
      setweight(to_tsvector('simple', concat_ws(' ', a.studio, a.type)), 'B') ||
      setweight(to_tsvector('simple', coalesce((
        select string_agg(g.name, ' ') from anime_genres ag join genres g on g.id = ag.genre_id where ag.anime_id = a.id
      ), '')), 'C') ||
      setweight(to_tsvector('simple', coalesce((
        select string_agg(ch.name || ' ' || coalesce(ch.voice_actor_name, ''), ' ') from characters ch where ch.anime_id = a.id
      ), '')), 'C') ||
      setweight(to_tsvector('simple', coalesce(a.synopsis, '')), 'D')
    where a.id = ${animeId}
  `)
}

export async function findAnimeIdByTitle(title: string): Promise<number | null> {
  const key = normalizeTitleKey(title)
  if (!key) return null
  const result = await db().execute(sql`
    select id from anime
    where regexp_replace(lower(title), '[^a-z0-9]+', '', 'g') = ${key}
       or exists (
         select 1 from jsonb_array_elements_text(coalesce(extra->'titles', '[]'::jsonb)) as t(value)
         where regexp_replace(lower(t.value), '[^a-z0-9]+', '', 'g') = ${key}
       )
    limit 1`)
  return resultRows<{ id: number }>(result)[0]?.id ?? null
}

export async function linkSource(sourceRowId: number, animeId: number): Promise<void> {
  await db()
    .update(animeSources)
    .set({
      animeId,
      metadataState: 'linked',
      metadataCheckedAt: new Date(),
      metadataSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(animeSources.id, sourceRowId))
}

export async function refreshCanonicalMetadata(animeId: number): Promise<boolean> {
  const [row] = await db().select({ malId: anime.malId }).from(anime).where(eq(anime.id, animeId)).limit(1)
  if (!row) return false
  const mal = await fetchMalAnime(row.malId)
  if (!mal) return false
  await upsertCanonicalAnime(mal)
  return true
}
