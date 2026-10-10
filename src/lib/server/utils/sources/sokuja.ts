import * as cheerio from 'cheerio/slim'
import { Effect, Ref } from 'effect'
import { proxyUrl } from '../media/proxy'
import { sealStreamToken } from '../media/stream'
import { Http } from '../net/http'
import { getSpoofHeaders } from '../net/spoof'
import { cleanTitleWithRules, type TitleCleanupRule } from './shared'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail, SourceEffect } from './types'

const ENTRY_URL = 'https://sokuja.net'
const CANONICAL_URL = 'https://x6.sokuja.uk'
const TIMEOUT_MS = 12000

const baseUrlRef = Ref.makeUnsafe<string | null>(null)

function resolveBaseUrl(): SourceEffect<string> {
  return Effect.gen(function* () {
    const cached = yield* Ref.get(baseUrlRef)
    if (cached) return cached
    const resolved = yield* Effect.tryPromise({
      try: async () => {
        const res = await fetch(proxyUrl(ENTRY_URL), {
          redirect: 'manual',
          headers: getSpoofHeaders(ENTRY_URL, 'navigate'),
          signal: AbortSignal.timeout(8000),
        })
        const location = res.headers.get('location')
        return location ? new URL(location, ENTRY_URL).origin : CANONICAL_URL
      },
      catch: () => new Error('sokuja entry unreachable'),
    }).pipe(Effect.catch(() => Effect.succeed(CANONICAL_URL)))
    yield* Ref.set(baseUrlRef, resolved)
    return resolved
  })
}

const SCRAPER_TITLE_CLEANUP: TitleCleanupRule[] = [/\s*Subtitle\s+Indonesia/gi, /\s*Sub\s+Indo(nesia)?/gi]

interface JsonLdTvSeries {
  '@type'?: string
  name?: string
  description?: string
  image?: string
  datePublished?: string
  genre?: string[]
  aggregateRating?: { ratingValue?: number }
}

interface JsonLdVideo {
  partOfSeries?: { name?: string; url?: string }
  thumbnailUrl?: string
}

function cleanTitle(title: string): string {
  return cleanTitleWithRules(title, SCRAPER_TITLE_CLEANUP)
}

function slugFromPath(href: string): string {
  return href.replace(/^\//, '').replace(/\/$/, '')
}

function animeSlugFromHref(href: string): string {
  return href.match(/^\/anime\/([^/]+)\/?$/)?.[1] ?? ''
}

function jsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  return $('script[type="application/ld+json"]')
    .map((_, el) => {
      try {
        return JSON.parse($(el).text()) as Record<string, unknown>
      } catch {
        return null
      }
    })
    .get()
    .filter((entry): entry is Record<string, unknown> => entry !== null)
}

function parseCards($: cheerio.CheerioAPI): ScrapedAnimeCard[] {
  const anime: ScrapedAnimeCard[] = []
  $('a.group.block').each((_, el) => {
    const $el = $(el)
    const href = $el.attr('href') || ''
    if (!href.startsWith('/anime/')) return
    const slug = animeSlugFromHref(href)
    if (!slug) return
    anime.push({
      slug,
      date: '',
    })
  })
  return anime
}

function parseTotalPages($: cheerio.CheerioAPI, page: number): number {
  let total = page
  $('a[href]').each((_, el) => {
    const match = ($(el).attr('href') || '').match(/[?&]page=(\d+)/)
    if (match) total = Math.max(total, Number(match[1]))
  })
  return total
}

function scrapeListFresh(status: 'ongoing' | 'completed', page: number): SourceEffect<ListResult> {
  return Effect.gen(function* () {
    const base = yield* resolveBaseUrl()
    const url = `${base}/anime/?status=${status}&order=update${page > 1 ? `&page=${page}` : ''}`
    const http = yield* Http
    const html = yield* http.html(url, TIMEOUT_MS)
    const $ = cheerio.load(html)
    const anime = parseCards($)
    return { anime, totalPages: parseTotalPages($, page) }
  })
}

function parseInfo($: cheerio.CheerioAPI): Record<string, string> {
  const info: Record<string, string> = {}
  $('dt').each((_, el) => {
    const key = $(el).text().trim()
    if (!key) return
    info[key] = $(el).next('dd').text().replace(/\s+/g, ' ').trim()
  })
  return info
}

function parseDetailEpisodes($: cheerio.CheerioAPI): { title: string; slug: string; date: string }[] {
  const heading = $('h2')
    .filter((_, el) => $(el).text().trim().startsWith('Daftar Episode'))
    .first()
  if (heading.length === 0) return []
  const episodes: { title: string; slug: string; date: string }[] = []
  heading
    .parent()
    .parent()
    .find('a[href]')
    .each((_, el) => {
      const href = $(el).attr('href') || ''
      if (!/-episode-\d+-subtitle-indonesia\/?$/.test(href)) return
      const spans = $(el).find('span')
      const title = spans.eq(0).text().trim()
      if (!title) return
      episodes.push({ title, slug: slugFromPath(href), date: spans.eq(1).text().trim() })
    })
  return episodes
}

function scrapeAnimeDetailFresh(slug: string): SourceEffect<ScrapedAnimeDetail | null> {
  return Effect.gen(function* () {
    const base = yield* resolveBaseUrl()
    const http = yield* Http
    const html = yield* http.html(`${base}/anime/${slug}/`, TIMEOUT_MS)
    const $ = cheerio.load(html)
    const series = jsonLd($).find(entry => entry['@type'] === 'TVSeries') as JsonLdTvSeries | undefined
    const title = cleanTitle(String(series?.name ?? $('h1').first().text()).trim())
    if (!title) return null

    const info = parseInfo($)
    const episodes = parseDetailEpisodes($)

    return {
      title,
      japanese: '',
      status: info.Status ?? '',
      releaseDate: String(series?.datePublished ?? info.Tahun ?? ''),
      episodes,
    }
  })
}

interface MirrorApiEntry {
  serverName?: string
  embedUrl?: string
  quality?: string
  embedType?: string
}

function fetchMirrors(episodeId: number): SourceEffect<EpisodeData['mirrors']> {
  return Effect.gen(function* () {
    const base = yield* resolveBaseUrl()
    const url = `${base}/api/video-mirrors/?e=${episodeId}`
    const http = yield* Http
    const data = yield* http
      .text(url, { timeoutMs: 8000, headers: getSpoofHeaders(url, 'cors') })
      .pipe(Effect.map(response => (response?.status === 200 ? response.text : null)))
    if (!data) return []
    const parsed = yield* Effect.try({
      try: () => JSON.parse(data) as { mirrors?: MirrorApiEntry[] },
      catch: () => new Error('invalid mirror payload'),
    }).pipe(Effect.catch(() => Effect.succeed(null)))
    const grouped = new Map<string, { name: string; dataContent: string }[]>()
    for (const mirror of parsed?.mirrors ?? []) {
      if (!mirror.embedUrl) continue
      const quality = mirror.quality || 'default'
      const dataContent = yield* Effect.promise(() => sealStreamToken(`sokuja:${mirror.embedUrl}`))
      const list = grouped.get(quality) ?? []
      list.push({ name: mirror.serverName || 'SOKUJA', dataContent })
      grouped.set(quality, list)
    }
    return [...grouped].map(([quality, sources]) => ({ quality, sources }))
  })
}

function scrapeEpisodeFresh(slug: string): SourceEffect<EpisodeData | null> {
  return Effect.gen(function* () {
    const base = yield* resolveBaseUrl()
    const http = yield* Http
    const html = yield* http.html(`${base}/${slug}/`, TIMEOUT_MS)
    const $ = cheerio.load(html)
    const title = $('h1').first().text().trim()
    const video = jsonLd($).find(entry => entry.partOfSeries) as JsonLdVideo | undefined
    const episodeId = html.match(/episodeId[\\"]*:(\d+)/)?.[1]
    if (!title && !episodeId) return null

    const seriesUrl = String(video?.partOfSeries?.url ?? '')
    return {
      title,
      animeSlug: seriesUrl.match(/\/anime\/([^/]+)\/?$/)?.[1] ?? '',
      animeTitle: String(video?.partOfSeries?.name ?? ''),
      mirrors: episodeId ? yield* fetchMirrors(Number(episodeId)) : [],
      episodeNav: [],
      thumbnail: String(video?.thumbnailUrl ?? ''),
    }
  })
}

function resolveMirror(opaque: string): SourceEffect<string | null> {
  return Effect.succeed(opaque.startsWith('http') ? opaque : null)
}

export const sokuja: AnimeSource = {
  id: 'sokuja',
  name: 'Sokuja',
  baseUrl: CANONICAL_URL,
  ongoingFresh: page => scrapeListFresh('ongoing', page),
  completedFresh: page => scrapeListFresh('completed', page),
  detailFresh: scrapeAnimeDetailFresh,
  episodeFresh: scrapeEpisodeFresh,
  resolveMirror,
}
