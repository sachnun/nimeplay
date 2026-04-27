import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { fetchMalId, fetchSkipTimes } from '../utils/aniskip'
import { cached } from '../utils/cache'
import { extractStreamUrl, probeIframeUrl } from '../utils/extractors'
import { fetchJikanData } from '../utils/jikan'
import {
  resolvemirror,
  scrapeAnimeDetail,
  scrapeCompleted,
  scrapeEpisode,
  scrapeGenre,
  scrapeGenreList,
  scrapeOngoing,
  scrapeSearch,
} from '../utils/scraper'

const t = initTRPC.create()
const procedure = t.procedure

const MIRROR_PREPARE_TTL = 10 * 60 * 1000

const pageInput = z.object({ page: z.number().int().positive().default(1) })

function episodeNumberFromTitle(title: string, index: number) {
  return title.match(/episode\s*(\d+)/i)?.[1] ?? `${index + 1}`
}

export const appRouter = t.router({
  home: procedure.query(async () => {
    const [ongoingData, completedData, genres] = await Promise.all([
      scrapeOngoing(1),
      scrapeCompleted(1),
      scrapeGenreList(),
    ])

    return { ongoingData, completedData, genres }
  }),

  anime: procedure
    .input(z.object({ slug: z.string() }))
    .query(({ input }) => scrapeAnimeDetail(input.slug)),

  animeDetails: procedure
    .input(z.object({ slugs: z.array(z.string()) }))
    .query(async ({ input }) => {
      const seen = new Set<string>()
      const slugs = input.slugs.map((slug) => slug.trim()).filter((slug) => slug && !seen.has(slug) && seen.add(slug))
      return Promise.all(slugs.map(async (slug) => {
        try {
          return { slug, anime: await scrapeAnimeDetail(slug) }
        } catch {
          return { slug, anime: null }
        }
      }))
    }),

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

  aniskipMalId: procedure
    .input(z.object({ title: z.string() }))
    .query(async ({ input }) => {
      const title = input.title.trim()
      return { malId: title ? await fetchMalId(title) : null }
    }),

  skipTimes: procedure
    .input(z.object({ malId: z.number().int(), episode: z.number().int(), episodeLength: z.number() }))
    .query(({ input }) => {
      if (!input.malId || !input.episode || !input.episodeLength) return []
      return fetchSkipTimes(input.malId, input.episode, input.episodeLength)
    }),

  skipTimesLookup: procedure
    .input(z.object({ title: z.string(), episode: z.number().int(), episodeLength: z.number() }))
    .query(async ({ input }) => {
      const title = input.title.trim()
      if (!title || !input.episode || !input.episodeLength) return { malId: null, skipTimes: [] }
      const malId = await fetchMalId(title)
      return { malId, skipTimes: malId ? await fetchSkipTimes(malId, input.episode, input.episodeLength) : [] }
    }),

  resolveMirror: procedure
    .input(z.object({ dataContent: z.string() }))
    .mutation(async ({ input }) => ({
      iframeUrl: await resolvemirror(input.dataContent),
    })),

  probeIframe: procedure
    .input(z.object({ iframeUrl: z.string() }))
    .mutation(async ({ input }) => ({
      ok: await probeIframeUrl(input.iframeUrl),
    })),

  extractStream: procedure
    .input(z.object({ iframeUrl: z.string() }))
    .mutation(({ input }) => extractStreamUrl(input.iframeUrl)),

  prepareMirror: procedure
    .input(z.object({ dataContent: z.string(), extract: z.boolean() }))
    .mutation(({ input }) => cached(
      `prepare-mirror:${input.extract ? 'extract' : 'probe'}:${input.dataContent}`,
      MIRROR_PREPARE_TTL,
      async () => {
        const iframeUrl = await resolvemirror(input.dataContent)
        if (!iframeUrl) return { iframeUrl: null, proxiedUrl: null, ok: false }
        if (!input.extract) return { iframeUrl, proxiedUrl: null, ok: await probeIframeUrl(iframeUrl) }

        const extracted = await extractStreamUrl(iframeUrl)
        return { iframeUrl: extracted.iframeUrl, proxiedUrl: extracted.proxiedUrl, ok: !!extracted.proxiedUrl }
      },
    )),
})

export type AppRouter = typeof appRouter
