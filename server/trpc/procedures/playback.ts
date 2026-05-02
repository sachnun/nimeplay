import { z } from 'zod'
import { procedure } from '../init'
import { fetchMalId, fetchSkipTimes } from '../../utils/aniskip'
import { cached } from '../../utils/cache'
import { extractStreamUrl, probeIframeUrl } from '../../utils/extractors'
import { resolvemirror } from '../../utils/scraper'

const MIRROR_PREPARE_TTL = 10 * 60 * 1000

export const playbackProcedures = {
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
}
