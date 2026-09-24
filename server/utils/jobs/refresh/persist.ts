import { and, eq, inArray, sql } from 'drizzle-orm'
import { anime, animeGenres, animeSources, characters, episodes, genres } from '../../../database/schema'
import type { AnimeSourceRow } from '../../../database/schema'
import { db } from '../../db'
import { fetchMalAnime } from '../../mal'
import { isValidMediaKey, mediaRef, type MediaRef } from '../../media'
import { ingestMedia } from '../../media/ingest'
import type { MalAnime } from '../../mal/types'
import type { AnimeSource } from '../../sources/types'
import { chunkValues, episodeNumber } from './util'
import { warn } from '../../log'
import { normalizeTitleKey } from '../../mal/title'

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function recordMetadataFailure(slug: string, message: string): Promise<void> {
  warn(`[metadata] failed ${slug}`, { error: message })
  return Promise.resolve()
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

export async function upsertEpisodes(source: AnimeSource, sourceId: number, list: { title: string, slug: string, date: string }[]): Promise<void> {
  const rows = list
    .map(entry => ({ entry, number: episodeNumber(entry.slug) ?? episodeNumber(entry.title) }))
    .filter((row): row is { entry: typeof list[number], number: number } => row.number !== null && !EPISODE_JUNK.test(row.entry.title))

  const client = db()
  for (const chunk of chunkValues(rows, 15)) {
    await client.insert(episodes).values(chunk.map(({ entry, number }) => ({
      sourceId,
      slug: `${source.id}:${entry.slug}`,
      number,
      title: entry.title,
      releaseDate: entry.date || null,
    }))).onConflictDoNothing()
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
      day = coalesce(s.day, a.day),
      ongoing_rank = coalesce(s.rank, a.ongoing_rank),
      latest_episode_at = greatest(a.latest_episode_at, s.latest_at),
      updated_at = now()
    from (
      select
        min(ongoing_rank) as rank,
        max(latest_episode_at) as latest_at,
        (array_agg(day order by ongoing_rank asc nulls last, updated_at desc) filter (where day is not null))[1] as day
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
  const values: typeof anime.$inferInsert = {
    malId: mal.malId,
    ...(mal.title ? { title: mal.title } : {}),
    ...(mal.type ? { type: mal.type } : {}),
    synopsis: mal.synopsis,
    ...(posterKey ? { posterKey } : {}),
    rating: mal.score,
    rank: mal.rank,
    popularity: mal.popularity,
    ...(mal.status ? { status: mal.status } : {}),
    season: mal.season,
    year: mal.year,
    trailerId: mal.trailerId,
    studio: mal.studio,
    source: mal.source,
    extra: { episodeTotal: mal.episodeTotal, titles: mal.titles },
    metadataSyncedAt: new Date(),
    updatedAt: new Date(),
  }

  const [row] = await db()
    .insert(anime)
    .values(values)
    .onConflictDoUpdate({ target: anime.malId, set: values })
    .returning({ id: anime.id })
  const animeId = row!.id

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
  return animeId
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
    limit 1`) as unknown as { rows: { id: number }[] }
  return result.rows[0]?.id ?? null
}

export async function linkSource(sourceRowId: number, animeId: number): Promise<void> {
  await db()
    .update(animeSources)
    .set({ animeId, metadataSyncedAt: new Date(), updatedAt: new Date() })
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
