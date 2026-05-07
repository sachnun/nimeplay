import { z } from 'zod'
import { procedure } from '../init'
import { getAnimeDetail, getAnimeDetails, getAnimePage, getGenreAnime, getGenreList, getHomeData, getPersistedJikanData, searchAnime } from '../../services/animeRepository'
import { scrapeEpisode } from '../../utils/scraper'

const pageInput = z.object({ page: z.number().int().positive().default(1) })

function episodeNumberFromTitle(title: string, index: number) {
  return title.match(/episode\s*(\d+)/i)?.[1] ?? `${index + 1}`
}

function uniqueSlugs(slugs: string[]) {
  const seen = new Set<string>()
  return slugs.map((slug) => slug.trim()).filter((slug) => slug && !seen.has(slug) && seen.add(slug))
}

export const animeProcedures = {
  home: procedure.query(() => getHomeData()),

  anime: procedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) => getAnimeDetail(input.slug)),

  animeDetails: procedure
    .input(z.object({ slugs: z.array(z.string()) }))
    .query(({ input }) => getAnimeDetails(uniqueSlugs(input.slugs))),

  episode: procedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) => scrapeEpisode(input.slug)),

  episodePage: procedure
    .input(z.object({ animeSlug: z.string(), episode: z.string() }))
    .query(async ({ input }) => {
      const animeSlug = input.animeSlug.trim()
      const episodeNumber = input.episode.trim()
      if (!animeSlug || !episodeNumber) return { anime: null, episodeSlug: null, episode: null }

      const anime = await getAnimeDetail(animeSlug)
      if (!anime) return { anime: null, episodeSlug: null, episode: null }

      const reversed = [...anime.episodes].reverse()
      const match = reversed.find((episode, index) => episodeNumberFromTitle(episode.title, index) === episodeNumber)
      const pageAnime = { thumbnail: anime.thumbnail }
      if (!match) return { anime: pageAnime, episodeSlug: null, episode: null }

      return { anime: pageAnime, episodeSlug: match.slug, episode: await scrapeEpisode(match.slug) }
    }),

  animePage: procedure
    .input(pageInput.extend({ type: z.enum(['ONGOING', 'COMPLETED']) }))
    .query(({ input }) => getAnimePage(input.type, input.page)),

  genres: procedure.query(() => getGenreList()),

  genre: procedure
    .input(pageInput.extend({ slug: z.string() }))
    .query(({ input }) => getGenreAnime(input.slug, input.page)),

  search: procedure
    .input(z.object({ query: z.string() }))
    .query(({ input }) => {
      const query = input.query.trim()
      return query ? searchAnime(query) : []
    }),

  jikanAnime: procedure
    .input(z.object({ title: z.string(), japaneseTitle: z.string().optional(), cachedMalId: z.number().int().positive().optional() }))
    .query(({ input }) => {
      const title = input.title.trim()
      if (!title) return null
      return getPersistedJikanData({ title, japaneseTitle: input.japaneseTitle || undefined, cachedMalId: input.cachedMalId || null })
    }),
}
