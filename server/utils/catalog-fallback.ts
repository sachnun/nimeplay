import { posterSrc } from './r2'
import { snapshotCatalog, type CatalogSnapshot, type SnapshotAnime } from './catalog-snapshot'

export interface Genre {
  name: string
  slug: string
}

const PAGE_SIZE = 24

interface SnapshotIndex {
  snapshot: CatalogSnapshot
  byMalId: Map<number, SnapshotAnime>
  genresList: Genre[]
  genresByAnime: Map<string, Genre[]>
  episodesByAnime: Map<string, { number: number, slug: string, title: string, date: string }[]>
}

let snapshotIndex: SnapshotIndex | null = null

function indexSnapshot(snapshot: CatalogSnapshot): SnapshotIndex {
  const byMalId = new Map<number, SnapshotAnime>()
  for (const row of snapshot.anime) if (row.malId != null) byMalId.set(row.malId, row)

  const genreName = new Map(snapshot.genres.map(g => [g.slug, g.name]))
  const genresByAnime = new Map<string, Genre[]>()
  for (const link of snapshot.animeGenreSlugs) {
    const list = genresByAnime.get(link.animeSlug) ?? []
    list.push({ slug: link.genreSlug, name: genreName.get(link.genreSlug) ?? link.genreSlug })
    genresByAnime.set(link.animeSlug, list)
  }
  for (const list of genresByAnime.values()) list.sort((a, b) => a.name.localeCompare(b.name))

  const episodesByAnime = new Map<string, { number: number, slug: string, title: string, date: string }[]>()
  for (const ep of snapshot.episodes) {
    const list = episodesByAnime.get(ep.animeSlug) ?? []
    list.push({ number: ep.number, slug: ep.slug, title: ep.title, date: ep.date })
    episodesByAnime.set(ep.animeSlug, list)
  }
  for (const list of episodesByAnime.values()) list.sort((a, b) => a.number - b.number)

  return {
    snapshot,
    byMalId,
    genresList: snapshot.genres.slice().sort((a, b) => a.name.localeCompare(b.name)),
    genresByAnime,
    episodesByAnime,
  }
}

async function loadIndex(explicit?: CatalogSnapshot): Promise<SnapshotIndex | null> {
  if (explicit) return indexSnapshot(explicit)
  const snapshot = await snapshotCatalog()
  if (!snapshot) return null
  if (snapshotIndex?.snapshot === snapshot) return snapshotIndex
  snapshotIndex = indexSnapshot(snapshot)
  return snapshotIndex
}

function maxEpisode(eps: { number: number }[] | undefined): number | null {
  return eps && eps.length > 0 ? eps[eps.length - 1]!.number : null
}

function seasonYear(season: string | null): number {
  const tail = (season ?? '').trim().match(/(\d{4})$/)?.[1]
  return tail ? Number(tail) : 0
}

function seasonRank(season: string | null): number {
  const value = (season ?? '').toLowerCase()
  if (value.includes('winter')) return 1
  if (value.includes('spring')) return 2
  if (value.includes('summer')) return 3
  if (value.includes('fall')) return 4
  return 0
}

function formatSeason(season: string | null): string {
  if (!season) return ''
  return season.replace(/(^|\s)\S/g, part => part.toUpperCase())
}

export async function getGenreListFromSnapshot(explicit?: CatalogSnapshot): Promise<Genre[]> {
  const index = await loadIndex(explicit)
  return index?.genresList ?? []
}

export async function listAnimePageFromSnapshot(
  status: 'ONGOING' | 'COMPLETED',
  page: number,
  explicit?: CatalogSnapshot,
): Promise<{ anime: { malId: number, title: string, thumbnail: string, episode: string, day: string, date: string, rating?: string }[], totalPages: number }> {
  const index = await loadIndex(explicit)
  if (!index) throw new Error('Catalog snapshot unavailable')
  const rows = index.snapshot.anime.filter(row => row.malId != null && row.status === status)
  if (status === 'ONGOING') {
    rows.sort((a, b) => (a.ongoingRank ?? Number.MAX_SAFE_INTEGER) - (b.ongoingRank ?? Number.MAX_SAFE_INTEGER)
      || (b.latestEpisodeAt ?? 0) - (a.latestEpisodeAt ?? 0))
  }
  else {
    rows.sort((a, b) => (seasonYear(b.season) - seasonYear(a.season)) || (seasonRank(b.season) - seasonRank(a.season)) || a.title.localeCompare(b.title))
  }
  const total = rows.length
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  return {
    anime: pageRows.map(row => {
      const max = maxEpisode(index.episodesByAnime.get(row.slug))
      return {
        malId: row.malId!,
        title: row.title,
        thumbnail: posterSrc(row.poster),
        episode: max != null ? `Episode ${max}` : '',
        day: row.day ?? '',
        date: formatSeason(row.season),
        rating: row.rating != null ? String(row.rating) : undefined,
      }
    }),
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}

export async function searchAnimeFromSnapshot(
  query: string,
  explicit?: CatalogSnapshot,
): Promise<{ malId: number, title: string, thumbnail: string, genres: string, status: string, rating: string }[]> {
  const index = await loadIndex(explicit)
  if (!index) throw new Error('Catalog snapshot unavailable')
  const needle = query.toLowerCase()
  return index.snapshot.anime
    .filter(row => row.malId != null && row.title.toLowerCase().includes(needle))
    .slice(0, 20)
    .map(row => ({
      malId: row.malId!,
      title: row.title,
      thumbnail: posterSrc(row.poster),
      genres: (index.genresByAnime.get(row.slug) ?? []).map(g => g.name).join(', '),
      status: row.status ?? '',
      rating: row.rating != null ? String(row.rating) : '',
    }))
}

export async function getAnimeDetailFromSnapshot(
  malId: number,
  explicit?: CatalogSnapshot,
): Promise<{
  malId: number, title: string, japanese: string, score: string, producer: string, type: string,
  status: string, totalEpisode: string, duration: string, releaseDate: string, studio: string,
  source: string, genres: Genre[], thumbnail: string, synopsis: string, season: string,
  episodes: { number: number, date: string }[],
} | null> {
  const index = await loadIndex(explicit)
  if (!index) return null
  const row = index.byMalId.get(malId)
  if (!row) return null
  const episodes = index.episodesByAnime.get(row.slug) ?? []
  return {
    malId,
    title: row.title,
    japanese: '',
    score: row.rating != null ? String(row.rating) : '',
    producer: '',
    type: row.type ?? '',
    status: row.status === 'COMPLETED' ? 'Completed' : 'Ongoing',
    totalEpisode: String(episodes.length),
    duration: '',
    releaseDate: '',
    studio: row.studio ?? '',
    source: row.source ?? '',
    genres: index.genresByAnime.get(row.slug) ?? [],
    thumbnail: posterSrc(row.poster),
    synopsis: row.synopsis ?? '',
    season: row.season ?? '',
    episodes: episodes.map(entry => ({ number: entry.number, date: entry.date })),
  }
}

export async function resolveEpisodeFromSnapshot(
  malId: number,
  number: number,
  explicit?: CatalogSnapshot,
): Promise<{ anime: { title: string, thumbnail: string }, sourceSlug: string, episodeTitle: string } | null> {
  const index = await loadIndex(explicit)
  if (!index) return null
  const row = index.byMalId.get(malId)
  if (!row) return null
  const episode = (index.episodesByAnime.get(row.slug) ?? []).find(ep => ep.number === number)
  if (!episode) return null
  return {
    anime: { title: row.title, thumbnail: posterSrc(row.poster) },
    sourceSlug: episode.slug,
    episodeTitle: episode.title,
  }
}

export async function getGenreAnimePageFromSnapshot(
  slug: string,
  page: number,
  explicit?: CatalogSnapshot,
): Promise<{ anime: { malId: number, title: string, thumbnail: string, studio: string, episodes: string, rating: string, genres: string, date: string }[], totalPages: number } | null> {
  const index = await loadIndex(explicit)
  if (!index) return null
  const rows = index.snapshot.anime
    .filter(row => row.malId != null && (index.genresByAnime.get(row.slug) ?? []).some(g => g.slug === slug))
    .sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
  if (rows.length === 0) return null
  const total = rows.length
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  return {
    anime: pageRows.map(row => ({
      malId: row.malId!,
      title: row.title,
      thumbnail: posterSrc(row.poster),
      studio: '',
      episodes: '',
      rating: row.rating != null ? String(row.rating) : '',
      genres: (index.genresByAnime.get(row.slug) ?? []).map(g => g.name).join(', '),
      date: formatSeason(row.season),
    })),
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  }
}