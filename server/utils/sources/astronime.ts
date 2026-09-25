import * as cheerio from 'cheerio'
import { getSpoofHeaders } from '../net/spoof'
import { proxyFetch } from '../media/proxy'
import { sealStreamToken } from '../media/stream'
import { cleanTitleWithRules, fetchHTML, type TitleCleanupRule } from './shared'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail } from './types'

const BASE_URL = 'https://astronime.id'
const TIMEOUT_MS = 12000

const TITLE_CLEANUP: TitleCleanupRule[] = [
  /\s*Sub(title)?\s*Indo(nesia)?/gi,
]

function cleanTitle(title: string): string {
  return cleanTitleWithRules(title, TITLE_CLEANUP)
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  }
  catch {
    return value
  }
}

function seriesSlugFromHref(href: string): string {
  return decode(href.match(/\/anime\/([^/]+)\/?$/)?.[1] ?? '')
}

function episodeSlugFromHref(href: string): string {
  const match = href.match(/astronime\.id\/([^/?#]+)\/?$/)
  return match ? decode(match[1]!) : ''
}

function parseCards($: cheerio.CheerioAPI): ScrapedAnimeCard[] {
  const cards: ScrapedAnimeCard[] = []
  $('article.animpost').each((_, el) => {
    const $el = $(el)
    const href = $el.find('.animposx > a[href*="/anime/"]').first().attr('href') || ''
    const slug = seriesSlugFromHref(href)
    const title = cleanTitle($el.find('.data .title h2').first().text())
    if (!slug || !title) return
    const statusText = $el.find('.data .type').first().text().trim().toLowerCase()
    const status = statusText.includes('ongoing')
      ? 'ONGOING' as const
      : statusText.includes('completed') ? 'COMPLETED' as const : undefined
    const rating = $el.find('.content-thumb .score').text().replace(/[^0-9.]/g, '').trim()
    const thumbnail = $el.find('.content-thumb img').attr('data-lazy-src')
      || $el.find('.content-thumb img').attr('src')
      || ''
    cards.push({
      title,
      slug,
      thumbnail,
      episode: '',
      day: '',
      date: '',
      ...(rating ? { rating } : {}),
      ...(status ? { status } : {}),
    })
  })
  return cards
}

async function scrapeListFresh(status: 'ongoing' | 'completed', page: number): Promise<ListResult> {
  const statusParam = status === 'ongoing' ? 'Currently Airing' : 'Finished Airing'
  const query = `title=&order=&status=${encodeURIComponent(statusParam)}&type=`
  const url = page > 1
    ? `${BASE_URL}/daftar-anime/page/${page}/?${query}`
    : `${BASE_URL}/daftar-anime/?${query}`
  const html = await fetchHTML(url, TIMEOUT_MS)
  const $ = cheerio.load(html)
  let totalPages = page
  $('a[href]').each((_, el) => {
    const match = ($(el).attr('href') || '').match(/\/daftar-anime\/page\/(\d+)/)
    if (match) totalPages = Math.max(totalPages, Number(match[1]))
  })
  return { anime: parseCards($), totalPages }
}

async function scrapeAnimeDetailFresh(slug: string): Promise<ScrapedAnimeDetail | null> {
  const html = await fetchHTML(`${BASE_URL}/anime/${slug}/`, TIMEOUT_MS)
  const $ = cheerio.load(html)
  const title = cleanTitle($('h1.entry-title').first().text())
  if (!title) return null

  const info = $('.alternati > span').not('.type').map((_, el) => $(el).text().trim()).get().filter(Boolean)
  const genres = $('.genre-info a[href*="/genre/"]').map((_, el) => ({
    name: $(el).text().trim(),
    slug: ($(el).attr('href') || '').match(/\/genre\/([^/]+)/)?.[1] ?? '',
  })).get()
  const episodes = $('.epsleft').map((_, el) => {
    const $el = $(el)
    const href = $el.find('.lchx a').attr('href') || ''
    const episodeSlug = episodeSlugFromHref(href)
    const episodeTitle = cleanTitle($el.find('.lchx a').text())
    if (!episodeSlug || !episodeTitle) return null
    return { title: episodeTitle, slug: episodeSlug, date: $el.find('.date').text().trim() }
  }).get().filter((episode): episode is { title: string; slug: string; date: string } => episode !== null)

  return {
    title,
    japanese: '',
    score: $('.scorenum').first().text().trim(),
    producer: '',
    type: $('.alternati .type').first().text().trim(),
    status: info[0] ?? '',
    totalEpisode: String(episodes.length),
    duration: info[1] ?? '',
    releaseDate: info[2] ?? '',
    studio: '',
    genres,
    thumbnail: $('.infoanime .thumb img').first().attr('src') || '',
    synopsis: $('.desc .entry-content').first().text().trim(),
    episodes,
  }
}

interface ServerOption {
  post: string
  nume: string
  type: string
  name: string
}

async function resolvePlayer(option: ServerOption): Promise<string | null> {
  const body = `action=player_ajax&post=${encodeURIComponent(option.post)}&nume=${encodeURIComponent(option.nume)}&type=${encodeURIComponent(option.type)}`
  try {
    const res = await proxyFetch(`${BASE_URL}/wp-admin/admin-ajax.php`, {
      method: 'POST',
      headers: { ...getSpoofHeaders(BASE_URL, 'cors'), 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const html = await res.text()
    return html.match(/src=['"]([^'"]+)['"]/)?.[1] ?? null
  }
  catch {
    return null
  }
}

async function scrapeEpisodeFresh(slug: string): Promise<EpisodeData | null> {
  const html = await fetchHTML(`${BASE_URL}/${slug}/`, TIMEOUT_MS)
  const $ = cheerio.load(html)
  const title = cleanTitle($('h1.entry-title').first().text())
  if (!title) return null

  let animeSlug = ''
  let animeTitle = ''
  $('a[href*="/anime/"]').each((_, el) => {
    if (animeSlug) return
    const href = $(el).attr('href') || ''
    const candidate = seriesSlugFromHref(href)
    const text = $(el).text().trim()
    if (!candidate || !text || /^(anime|semua episode|view all)$/i.test(text)) return
    animeSlug = candidate
    animeTitle = text
  })

  const options: ServerOption[] = $('.east_player_option').map((_, el) => {
    const $el = $(el)
    return {
      post: $el.attr('data-post') || '',
      nume: $el.attr('data-nume') || '',
      type: $el.attr('data-type') || 'urliframe',
      name: $el.find('span').first().text().trim() || 'Server',
    }
  }).get().filter(option => option.post && option.nume)

  const sources: { name: string, dataContent: string }[] = []
  for (const option of options) {
    const embedUrl = await resolvePlayer(option).catch(() => null)
    if (!embedUrl) continue
    sources.push({ name: option.name, dataContent: await sealStreamToken(`astronime:${embedUrl}`) })
  }

  return {
    title,
    animeSlug,
    animeTitle,
    mirrors: sources.length > 0 ? [{ quality: 'default', sources }] : [],
    episodeNav: [],
    thumbnail: $('.info_episode img').first().attr('src') || '',
  }
}

async function resolveMirror(opaque: string): Promise<string | null> {
  return opaque.startsWith('http') ? opaque : null
}

export const astronime: AnimeSource = {
  id: 'astronime',
  name: 'Astronime',
  baseUrl: BASE_URL,
  ongoingFresh: page => scrapeListFresh('ongoing', page),
  completedFresh: page => scrapeListFresh('completed', page),
  detailFresh: scrapeAnimeDetailFresh,
  episodeFresh: scrapeEpisodeFresh,
  resolveMirror,
}
