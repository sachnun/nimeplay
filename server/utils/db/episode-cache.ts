import { Effect } from 'effect'
import { eq } from 'drizzle-orm'
import { episodes } from '../../database/schema'
import { db } from '../db'
import type { Http } from '../net/http'
import { scrapeEpisode } from '../sources'
import type { EpisodeData } from '../sources/types'

async function getEpisodeData(slug: string): Promise<EpisodeData | null> {
  const [row] = await db().select({ cache: episodes.cache }).from(episodes).where(eq(episodes.slug, slug)).limit(1)
  return row?.cache ?? null
}

async function putEpisodeData(slug: string, data: EpisodeData): Promise<void> {
  await db().update(episodes).set({ cache: data, cachedAt: new Date() }).where(eq(episodes.slug, slug))
}

export function loadEpisodeData(candidates: string[]): Effect.Effect<EpisodeData | null, never, Http> {
  return Effect.gen(function* () {
    let fallback: EpisodeData | null = null
    for (const slug of candidates) {
      const cached = yield* Effect.promise(() => getEpisodeData(slug))
      if (cached && cached.mirrors.length > 0) return cached

      const scraped = yield* scrapeEpisode(slug).pipe(Effect.catch(() => Effect.succeed(null)))
      if (!scraped) continue
      fallback ??= scraped
      if (scraped.mirrors.length === 0) continue
      yield* Effect.promise(() => putEpisodeData(slug, scraped)).pipe(Effect.catch(() => Effect.void))
      return scraped
    }
    return fallback
  })
}
