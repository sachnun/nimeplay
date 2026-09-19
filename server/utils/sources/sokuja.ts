import * as cheerio from 'cheerio'
import { getSpoofHeaders } from '../spoof'
import { sealStreamToken } from '../stream'
import { cleanTitleWithRules, fetchHTML, type TitleCleanupRule } from './shared'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail } from './types'

const BASE_URL = 'https://sokuja.net'

const SCRAPER_TITLE_CLEANUP: TitleCleanupRule[] = [
  /\s*Subtitle\s+Indonesia/gi,
  /\s*Sub\s+Indo(nesia)?/gi,
]

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

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function slugFromPath(href: string): string {
  return href.replace(/^\//, '').replace(/\/$/, '')
}

function animeSlugFromHref(href: string): string {
  return href.match(/^\/anime\/([^/]+)\/?$/)?.[1] ?? ''
}

function jsonLd($: cheerio.CheerioAPI): Record<string, unknown>[] {
  return $('script[type="application/ld+json"]').map((_, el) => {
    try {
      return JSON.parse($(el).text()) as Record<string, unknown>
    }
    catch {
      return null
    }
  }).get().filter((entry): entry is Record<string, unknown> => entry !== null)
}

function parseCards($: cheerio.CheerioAPI): ScrapedAnimeCard[] {
  const anime: ScrapedAnimeCard[] = []
  $('a.group.block').each((_, el) => {
    const $el = $(el)
    const href = $el.attr('href') || ''
    if (!href.startsWith('/anime/')) return
    const title = cleanTitle($el.find('h3').text().trim())
    const slug = animeSlugFromHref(href)
    if (!title || !slug) return
    const rating = $el.find('span').map((_, span) => $(span).text()).get()
      .find(text => text.includes('★'))?.replace(/[^0-9.]/g, '') ?? ''
    anime.push({
      title,
      slug,
      thumbnail: $el.find('img').attr('src') || '',
      episode: '',
      day: '',
      date: '',
      ...(rating ? { rating } : {}),
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

async function latestEpisodeMap(): Promise<Map<string, number>> {
  const html = await fetchHTML(`${BASE_URL}/`)
  const $ = cheerio.load(html)
  const section = $('h2').filter((_, el) => $(el).text().trim() === 'Update Terbaru').first().closest('section')
  const map = new Map<string, number>()
  section.find('a[href]').each((_, el) => {
    const match = ($(el).attr('href') || '').match(/^\/(.+)-episode-(\d+)-subtitle-indonesia\/?$/)
    if (!match) return
    const slug = `${match[1]}-subtitle-indonesia`
    const number = Number(match[2])
    const previous = map.get(slug)
    if (previous === undefined || number > previous) map.set(slug, number)
  })
  return map
}

async function mergeLatestEpisodes(cards: ScrapedAnimeCard[]): Promise<void> {
  if (cards.length === 0) return
  const latest = await latestEpisodeMap().catch(() => new Map<string, number>())
  for (const card of cards) {
    const number = latest.get(card.slug)
    if (number !== undefined) card.episode = `episode-${number}`
  }
}

async function scrapeListFresh(status: 'ongoing' | 'completed', page: number): Promise<ListResult> {
  const url = `${BASE_URL}/anime/?status=${status}&order=update${page > 1 ? `&page=${page}` : ''}`
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)
  const anime = parseCards($)
  if (status === 'ongoing' && page === 1) await mergeLatestEpisodes(anime)
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
  const heading = $('h2').filter((_, el) => $(el).text().trim().startsWith('Daftar Episode')).first()
  if (heading.length === 0) return []
  const episodes: { title: string; slug: string; date: string }[] = []
  heading.parent().parent().find('a[href]').each((_, el) => {
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
  const html = await fetchHTML(`${BASE_URL}/anime/${slug}/`)
  const $ = cheerio.load(html)
  const series = jsonLd($).find(entry => entry['@type'] === 'TVSeries') as JsonLdTvSeries | undefined
  const title = cleanTitle(String(series?.name ?? $('h1').first().text()).trim())
  if (!title) return null

  const info = parseInfo($)
  const episodes = parseDetailEpisodes($)
  const genres = Array.isArray(series?.genre) ? series.genre : []

  return {
    title,
    japanese: '',
    score: series?.aggregateRating?.ratingValue != null ? String(series.aggregateRating.ratingValue) : '',
    producer: '',
    type: info.Tipe ?? '',
    status: info.Status ?? '',
    totalEpisode: String(episodes.length),
    duration: '',
    releaseDate: String(series?.datePublished ?? info.Tahun ?? ''),
    studio: info.Studio ?? '',
    genres: genres.map(name => ({ name, slug: slugify(name) })),
    thumbnail: String(series?.image ?? ''),
    synopsis: String(series?.description ?? ''),
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
  const url = `${BASE_URL}/api/video-mirrors/?e=${episodeId}`
  try {
    const res = await fetch(url, { headers: getSpoofHeaders(url, 'cors'), signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json() as { mirrors?: MirrorApiEntry[] }
    const grouped = new Map<string, { name: string; dataContent: string }[]>()
    for (const mirror of data.mirrors ?? []) {
      if (!mirror.embedUrl) continue
      const quality = mirror.quality || 'default'
      const list = grouped.get(quality) ?? []
      list.push({ name: mirror.serverName || 'SOKUJA', dataContent: await sealStreamToken(`sokuja:${mirror.embedUrl}`) })
      grouped.set(quality, list)
    }
    return [...grouped].map(([quality, sources]) => ({ quality, sources }))
  }
  catch {
    return []
  }
}

async function scrapeEpisodeFresh(slug: string): Promise<EpisodeData | null> {
  const html = await fetchHTML(`${BASE_URL}/${slug}/`)
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
  baseUrl: BASE_URL,
  ongoingFresh: page => scrapeListFresh('ongoing', page),
  completedFresh: page => scrapeListFresh('completed', page),
  detailFresh: scrapeAnimeDetailFresh,
  episodeFresh: scrapeEpisodeFresh,
  resolveMirror,
}
