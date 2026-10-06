import * as cheerio from 'cheerio/slim'
import { proxyFetch, proxyUrl } from '../media/proxy'
import { sealStreamToken } from '../media/stream'
import { getSpoofHeaders } from '../net/spoof'
import { cleanTitleWithRules, fetchHTML, type TitleCleanupRule } from './shared'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail } from './types'

const ENTRY_URL = 'https://sokuja.net'
const CANONICAL_URL = 'https://x6.sokuja.uk'
const TIMEOUT_MS = 12000

let basePromise: Promise<string> | null = null

async function baseUrl(): Promise<string> {
  basePromise ??= (async () => {
    try {
      const res = await fetch(proxyUrl(ENTRY_URL), {
        redirect: 'manual',
        headers: getSpoofHeaders(ENTRY_URL, 'navigate'),
        signal: AbortSignal.timeout(8000),
      })
      const location = res.headers.get('location')
      return location ? new URL(location, ENTRY_URL).origin : CANONICAL_URL
    } catch {
      return CANONICAL_URL
    }
  })()
  return basePromise
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

async function scrapeListFresh(status: 'ongoing' | 'completed', page: number): Promise<ListResult> {
  const url = `${await baseUrl()}/anime/?status=${status}&order=update${page > 1 ? `&page=${page}` : ''}`
  const html = await fetchHTML(url, TIMEOUT_MS)
  const $ = cheerio.load(html)
  const anime = parseCards($)
  return { anime, totalPages: parseTotalPages($, page) }
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

async function scrapeAnimeDetailFresh(slug: string): Promise<ScrapedAnimeDetail | null> {
  const html = await fetchHTML(`${await baseUrl()}/anime/${slug}/`, TIMEOUT_MS)
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
}

interface MirrorApiEntry {
  serverName?: string
  embedUrl?: string
  quality?: string
  embedType?: string
}

async function fetchMirrors(episodeId: number): Promise<EpisodeData['mirrors']> {
  const url = `${await baseUrl()}/api/video-mirrors/?e=${episodeId}`
  try {
    const res = await proxyFetch(url, { headers: getSpoofHeaders(url, 'cors'), signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = (await res.json()) as { mirrors?: MirrorApiEntry[] }
    const grouped = new Map<string, { name: string; dataContent: string }[]>()
    for (const mirror of data.mirrors ?? []) {
      if (!mirror.embedUrl) continue
      const quality = mirror.quality || 'default'
      const list = grouped.get(quality) ?? []
      list.push({
        name: mirror.serverName || 'SOKUJA',
        dataContent: await sealStreamToken(`sokuja:${mirror.embedUrl}`),
      })
      grouped.set(quality, list)
    }
    return [...grouped].map(([quality, sources]) => ({ quality, sources }))
  } catch {
    return []
  }
}

async function scrapeEpisodeFresh(slug: string): Promise<EpisodeData | null> {
  const html = await fetchHTML(`${await baseUrl()}/${slug}/`, TIMEOUT_MS)
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
    mirrors: episodeId ? await fetchMirrors(Number(episodeId)) : [],
    episodeNav: [],
    thumbnail: String(video?.thumbnailUrl ?? ''),
  }
}

async function resolveMirror(opaque: string): Promise<string | null> {
  return opaque.startsWith('http') ? opaque : null
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
