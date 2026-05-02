import { z } from 'zod'
import { procedure } from '../init'
import { fetchJikanData } from '../../utils/jikan'
import {
  scrapeAnimeDetail,
  scrapeCompleted,
  scrapeEpisode,
  scrapeGenre,
  scrapeGenreList,
  scrapeOngoing,
  scrapeSearch,
} from '../../utils/scraper'

const pageInput = z.object({ page: z.number().int().positive().default(1) })
const emptyAnimePage = { anime: [], totalPages: 1 }

function episodeNumberFromTitle(title: string, index: number) {
  return title.match(/episode\s*(\d+)/i)?.[1] ?? `${index + 1}`
}

async function safeLoad<T>(load: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await load()
  } catch {
    return fallback
  }
}

function uniqueSlugs(slugs: string[]) {
  const seen = new Set<string>()
  return slugs.map((slug) => slug.trim()).filter((slug) => slug && !seen.has(slug) && seen.add(slug))
}

async function loadAnimeDetail(slug: string) {
  try {
    return { slug, anime: await scrapeAnimeDetail(slug) }
  } catch {
    return { slug, anime: null }
  }
}

export const animeProcedures = {
  home: procedure.query(async () => {
    const [ongoingData, completedData, genres] = await Promise.all([
      safeLoad(() => scrapeOngoing(1), emptyAnimePage),
      safeLoad(() => scrapeCompleted(1), emptyAnimePage),
      safeLoad(() => scrapeGenreList(), []),
    ])

    return { ongoingData, completedData, genres }
  }),

  anime: procedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) => scrapeAnimeDetail(input.slug)),

  animeDetails: procedure
    .input(z.object({ slugs: z.array(z.string()) }))
    .query(({ input }) => Promise.all(uniqueSlugs(input.slugs).map(loadAnimeDetail))),

  episode: procedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) => scrapeEpisode(input.slug)),

  episodePage: procedure
    .input(z.object({ animeSlug: z.string(), episode: z.string() }))
    .query(async ({ input }) => {
      const animeSlug = input.animeSlug.trim()
      const episodeNumber = input.episode.trim()
      if (!animeSlug || !episodeNumber) return { anime: null, episodeSlug: null, episode: null }

      const anime = await scrapeAnimeDetail(animeSlug)
      if (!anime) return { anime: null, episodeSlug: null, episode: null }

      const reversed = [...anime.episodes].reverse()
      const match = reversed.find((episode, index) => episodeNumberFromTitle(episode.title, index) === episodeNumber)
      const pageAnime = { thumbnail: anime.thumbnail }
      if (!match) return { anime: pageAnime, episodeSlug: null, episode: null }

      return { anime: pageAnime, episodeSlug: match.slug, episode: await scrapeEpisode(match.slug) }
    }),

  animePage: procedure
    .input(pageInput.extend({ type: z.enum(['ONGOING', 'COMPLETED']) }))
    .query(({ input }) => input.type === 'COMPLETED' ? scrapeCompleted(input.page) : scrapeOngoing(input.page)),

  genres: procedure.query(() => scrapeGenreList()),

  genre: procedure
    .input(pageInput.extend({ slug: z.string() }))
    .query(({ input }) => scrapeGenre(input.slug, input.page)),

  search: procedure
    .input(z.object({ query: z.string() }))
    .query(({ input }) => {
      const query = input.query.trim()
      return query ? scrapeSearch(query) : []
    }),

  jikanAnime: procedure
    .input(z.object({ title: z.string(), japaneseTitle: z.string().optional(), cachedMalId: z.number().int().positive().optional() }))
    .query(({ input }) => {
      const title = input.title.trim()
      if (!title) return null
      return fetchJikanData(title, input.japaneseTitle || undefined, input.cachedMalId || null)
    }),
}
