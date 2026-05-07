import * as cheerio from 'cheerio'
import { cached } from './cache'
import { timeoutSignal } from './fetch'
import { getSpoofHeaders } from './spoof'
import { cleanTitleWithRules, type TitleCleanupRule } from './title'

const BASE_URL = 'https://otakudesu.blog'
const LIST_TTL = 3 * 60 * 1000
const DETAIL_TTL = 30 * 60 * 1000
const EPISODE_TTL = 30 * 60 * 1000
const GENRE_LIST_TTL = 12 * 60 * 60 * 1000
const SEARCH_TTL = 2 * 60 * 1000
const MIRROR_TTL = 10 * 60 * 1000
const HTML_TIMEOUT_MS = 8000
const POST_TIMEOUT_MS = 8000
const SCRAPER_TITLE_CLEANUP: TitleCleanupRule[] = [
  /\s*\+\s*OVA\b/gi,
  /\s*\+\s*Special\b/gi,
  /\s*Subtitle\s+Indonesia/gi,
  /\s*Sub\s+Indo(nesia)?/gi,
  /\s*\(Episode\s+\d+\s*[-–—]\s*\d+(\s*\+\s*OVA)?\s*\)/i,
  /\s*\(Episode\s+\d+\s*[-–—]\s*\d+\s*End\s*\)/i,
  /\s*Sub\s+Indo\s*:\s*Episode\s+\d+\s*[-–—]\s*\d+\s*\(End\)/i,
  /\s+BD\b/,
]

export interface AnimeCard {
  title: string
  slug: string
  thumbnail: string
  episode: string
  day: string
  date: string
  rating?: string
}

export interface AnimeDetail {
  title: string
  japanese: string
  score: string
  producer: string
  type: string
  status: string
  totalEpisode: string
  duration: string
  releaseDate: string
  studio: string
  genres: { name: string; slug: string }[]
  thumbnail: string
  synopsis: string
  episodes: { title: string; slug: string; date: string }[]
}

export interface EpisodeData {
  title: string
  animeSlug: string
  animeTitle: string
  defaultIframeSrc: string
  mirrors: {
    quality: string
    sources: { name: string; dataContent: string }[]
  }[]
  episodeNav: { title: string; slug: string }[]
  thumbnail: string
}

export interface SearchResult {
  title: string
  slug: string
  thumbnail: string
  genres: string
  status: string
  rating: string
}

export interface Genre {
  name: string
  slug: string
}

export interface GenreAnimeCard {
  title: string
  slug: string
  thumbnail: string
  studio: string
  episodes: string
  rating: string
  genres: string
  date: string
}

export interface AnimeIndexItem {
  title: string
  slug: string
  isOngoing: boolean
}

export type LatestAnimeKind = 'ONGOING' | 'COMPLETED'

function cleanTitle(title: string): string {
  return cleanTitleWithRules(title, SCRAPER_TITLE_CLEANUP)
}

function extractSlug(href: string): string {
  const parts = href.replace(BASE_URL, '').split('/').filter(Boolean)
  return parts[parts.length - 1] || ''
}

function extractAnimeSlug(href: string): string {
  return href.match(/\/anime\/([^/]+)/)?.[1] ?? ''
}

function extractEpisodeSlug(href: string): string {
  return href.match(/\/episode\/([^/]+)/)?.[1] ?? ''
}

function cleanIndexTitle(title: string): string {
  return cleanTitle(title.replace(/\s+On-Going\s*$/i, ''))
}

function parseEpztipe(raw: string): { day: string; rating?: string } {
  const text = raw.replace(/[^\w\s.]/g, '').trim()
  if (/^\d+(\.\d+)?$/.test(text)) return { day: '', rating: text }
  return { day: text }
}

function getTotalPages($: cheerio.CheerioAPI): number {
  const lastPage = $('.pagenavix a.page-numbers').not('.next').last().text().trim()
  return Number.parseInt(lastPage) || 1
}

function parseAnimeCards($: cheerio.CheerioAPI): AnimeCard[] {
  const anime: AnimeCard[] = []
  $('.detpost').each((_, el) => {
    const $el = $(el)
    const epztipe = parseEpztipe($el.find('.epztipe').text())
    anime.push({
      title: $el.find('.jdlflm').text().trim(),
      slug: extractAnimeSlug($el.find('.thumb a').attr('href') || ''),
      thumbnail: $el.find('.thumbz img').attr('src') || '',
      episode: $el.find('.epz').text().trim(),
      day: epztipe.day,
      date: $el.find('.newnime').text().trim(),
      rating: epztipe.rating,
    })
  })
  return anime
}

function parseInfo($: cheerio.CheerioAPI): Record<string, string> {
  const info: Record<string, string> = {}
  $('.infozingle p span').each((_, el) => {
    const text = $(el).text()
    const colonIndex = text.indexOf(':')
    if (colonIndex === -1) return
    const key = text.slice(0, colonIndex).replace(/\*\*/g, '').trim()
    info[key] = text.slice(colonIndex + 1).trim()
  })
  return info
}

function parseGenres($: cheerio.CheerioAPI): { name: string; slug: string }[] {
  return $('.infozingle a[rel="tag"]').map((_, el) => ({
    name: $(el).text().trim(),
    slug: extractSlug($(el).attr('href') || ''),
  })).get()
}

function parseDetailEpisodes($: cheerio.CheerioAPI): { title: string; slug: string; date: string }[] {
  return $('.episodelist ul li').map((_, el) => {
    const $el = $(el)
    const link = $el.find('a').attr('href') || ''
    if (!link.includes('/episode/')) return null
    return {
      title: $el.find('a').text().trim(),
      slug: extractEpisodeSlug(link),
      date: $el.find('.zeebr').text().trim(),
    }
  }).get()
}

function infoValue(info: Record<string, string>, key: string): string {
  return info[key] || ''
}

function titleFromInfo(info: Record<string, string>, fallback: string): string {
  return infoValue(info, 'Judul') || fallback
}

function appendUniqueGenre(genres: Genre[], name: string, slug: string) {
  if (name && slug && !genres.some((genre) => genre.slug === slug)) genres.push({ name, slug })
}

async function scrapeAnimeListFresh(path: string, page: number): Promise<{ anime: AnimeCard[]; totalPages: number }> {
  const url = page > 1 ? `${BASE_URL}/${path}/page/${page}/` : `${BASE_URL}/${path}/`
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)
  return { anime: parseAnimeCards($), totalPages: getTotalPages($) }
}

function latestPath(kind: LatestAnimeKind): string {
  return kind === 'COMPLETED' ? 'complete-anime' : 'ongoing-anime'
}

async function fetchHTML(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: getSpoofHeaders(BASE_URL + '/'),
    signal: timeoutSignal(HTML_TIMEOUT_MS),
  })
  const html = await res.text()
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
  return html
}

function parseAnimeIndex($: cheerio.CheerioAPI): AnimeIndexItem[] {
  const seen = new Set<string>()
  const anime: AnimeIndexItem[] = []

  $('.daftarkartun a[href*="/anime/"]').each((_, el) => {
    const slug = extractAnimeSlug($(el).attr('href') || '')
    const text = $(el).text().trim()
    if (!slug || !text || seen.has(slug)) return
    seen.add(slug)
    anime.push({
      title: cleanIndexTitle(text),
      slug,
      isOngoing: /\bOn-Going\b/i.test(text),
    })
  })

  return anime
}

export async function scrapeAnimeIndex(): Promise<AnimeIndexItem[]> {
  const html = await fetchHTML(`${BASE_URL}/anime-list/`)
  return parseAnimeIndex(cheerio.load(html))
}

export function scrapeLatestAnime(kind: LatestAnimeKind, page = 1): Promise<{ anime: AnimeCard[]; totalPages: number }> {
  return scrapeAnimeListFresh(latestPath(kind), page)
}

async function corsPost(url: string, body: string): Promise<Record<string, unknown>> {
  const headers = getSpoofHeaders(BASE_URL + '/', 'cors')
  headers['Content-Type'] = 'application/x-www-form-urlencoded'
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body,
    signal: timeoutSignal(POST_TIMEOUT_MS),
  })
  return res.json()
}

async function scrapeOngoingFresh(page = 1): Promise<{ anime: AnimeCard[]; totalPages: number }> {
  return scrapeAnimeListFresh('ongoing-anime', page)
}

export function scrapeOngoing(page = 1): Promise<{ anime: AnimeCard[]; totalPages: number }> {
  return cached(`scrape:ongoing:${page}`, LIST_TTL, () => scrapeOngoingFresh(page))
}

async function scrapeCompletedFresh(page = 1): Promise<{ anime: AnimeCard[]; totalPages: number }> {
  return scrapeAnimeListFresh('complete-anime', page)
}

export function scrapeCompleted(page = 1): Promise<{ anime: AnimeCard[]; totalPages: number }> {
  return cached(`scrape:completed:${page}`, LIST_TTL, () => scrapeCompletedFresh(page))
}

async function scrapeAnimeDetailFresh(slug: string): Promise<AnimeDetail | null> {
  const html = await fetchHTML(`${BASE_URL}/anime/${slug}/`)
  const $ = cheerio.load(html)
  const h1Title = cleanTitle($('.jdlrx h1').text().trim())
  if (!h1Title) return null

  const info = parseInfo($)

  return {
    title: titleFromInfo(info, h1Title),
    japanese: infoValue(info, 'Japanese'),
    score: infoValue(info, 'Skor'),
    producer: infoValue(info, 'Produser'),
    type: infoValue(info, 'Tipe'),
    status: infoValue(info, 'Status'),
    totalEpisode: infoValue(info, 'Total Episode'),
    duration: infoValue(info, 'Durasi'),
    releaseDate: infoValue(info, 'Tanggal Rilis'),
    studio: infoValue(info, 'Studio'),
    genres: parseGenres($),
    thumbnail: $('.fotoanime img').attr('src') || '',
    synopsis: $('.sinopc p').text().trim(),
    episodes: parseDetailEpisodes($),
  }
}

export function scrapeAnimeDetailForSync(slug: string): Promise<AnimeDetail | null> {
  return scrapeAnimeDetailFresh(slug)
}

export function scrapeAnimeDetail(slug: string): Promise<AnimeDetail | null> {
  return cached(`scrape:anime:${slug}`, DETAIL_TTL, () => scrapeAnimeDetailFresh(slug))
}

async function scrapeEpisodeFresh(slug: string): Promise<EpisodeData | null> {
  const html = await fetchHTML(`${BASE_URL}/episode/${slug}/`)
  const $ = cheerio.load(html)
  const title = $('.posttl').text().trim()
  if (!title) return null

  return {
    title,
    animeSlug: parseEpisodeAnimeSlug($),
    animeTitle: $('.cukder .infozingle p span').first().text().replace('Credit:', '').trim(),
    defaultIframeSrc: $('.responsive-embed-stream iframe').attr('src') || '',
    mirrors: parseEpisodeMirrors($),
    episodeNav: parseEpisodeNav($),
    thumbnail: $('.cukder img').attr('src') || '',
  }
}

function parseEpisodeAnimeSlug($: cheerio.CheerioAPI): string {
  return extractAnimeSlug(
    $('.flir a[href*="/anime/"]').attr('href')
    || $('.alert-info a[href*="/anime/"]').attr('href')
    || $('a[href*="/anime/"][rel="follow"]').attr('href')
    || '',
  )
}

function parseMirrorQuality($ul: ReturnType<cheerio.CheerioAPI>): string {
  const classMatch = ($ul.attr('class') || '').match(/m(\d+p)/)
  const qualityText = $ul.find('span').first().text().trim()
  const textMatch = qualityText.match(/(\d+p)/)
  return classMatch?.[1] ?? textMatch?.[1] ?? qualityText
}

function parseMirrorSources($: cheerio.CheerioAPI, $ul: ReturnType<cheerio.CheerioAPI>) {
  return $ul.find('a[data-content]').map((_, a) => ({
    name: $(a).text().trim(),
    dataContent: $(a).attr('data-content') || '',
  })).get()
}

function parseEpisodeMirrors($: cheerio.CheerioAPI): EpisodeData['mirrors'] {
  return $('.mirrorstream ul').map((_, ul) => {
    const $ul = $(ul)
    const quality = parseMirrorQuality($ul)
    const sources = parseMirrorSources($, $ul)
    return sources.length > 0 && quality !== '360p' ? { quality, sources } : null
  }).get()
}

function parseEpisodeNav($: cheerio.CheerioAPI): EpisodeData['episodeNav'] {
  return $('#selectcog option').map((_, el) => {
    const value = $(el).attr('value') || ''
    return value && value !== '0' && value.includes('/episode/')
      ? { title: $(el).text().trim(), slug: extractEpisodeSlug(value) }
      : null
  }).get()
}

export function scrapeEpisode(slug: string): Promise<EpisodeData | null> {
  return cached(`scrape:episode:${slug}`, EPISODE_TTL, () => scrapeEpisodeFresh(slug))
}

async function resolvemirrorFresh(dataContent: string): Promise<string | null> {
  try {
    const nonceData = await corsPost(`${BASE_URL}/wp-admin/admin-ajax.php`, 'action=aa1208d27f29ca340c92c66d1926f13f')
    const nonce = nonceData.data as string
    const decoded = JSON.parse(atob(dataContent))
    const params = new URLSearchParams({
      id: decoded.id?.toString() || '',
      i: decoded.i?.toString() || '',
      q: decoded.q || '',
      nonce,
      action: '2a3505c93b0035d3f455df82bf976b84',
    })
    const mirrorData = await corsPost(`${BASE_URL}/wp-admin/admin-ajax.php`, params.toString())
    if (!mirrorData.data) return null
    const html = atob(mirrorData.data as string)
    return cheerio.load(html)('iframe').attr('src') || ''
  } catch {
    return null
  }
}

export function resolvemirror(dataContent: string): Promise<string | null> {
  return cached(`mirror:${dataContent}`, MIRROR_TTL, () => resolvemirrorFresh(dataContent))
}

async function scrapeSearchFresh(query: string): Promise<SearchResult[]> {
  const html = await fetchHTML(`${BASE_URL}/?s=${encodeURIComponent(query)}&post_type=anime`)
  const $ = cheerio.load(html)
  const results: SearchResult[] = []

  $('.chivsrc li').each((_, el) => {
    const $el = $(el)
    const sets = $el.find('.set')
    results.push({
      title: cleanTitle($el.find('h2 a').text().trim()),
      slug: extractAnimeSlug($el.find('h2 a').attr('href') || ''),
      thumbnail: $el.find('img').attr('src') || '',
      genres: sets.eq(0).text().replace('Genres :', '').trim(),
      status: sets.eq(1).text().replace('Status :', '').trim(),
      rating: sets.eq(2).text().replace('Rating :', '').trim(),
    })
  })

  return results
}

export function scrapeSearch(query: string): Promise<SearchResult[]> {
  return cached(`scrape:search:${query.toLowerCase()}`, SEARCH_TTL, () => scrapeSearchFresh(query))
}

async function scrapeGenreListFresh(): Promise<Genre[]> {
  const html = await fetchHTML(`${BASE_URL}/genre-list/`)
  const $ = cheerio.load(html)
  const genres: Genre[] = []

  $('.genres a[rel="tag"], .taxindex a[rel="tag"], .page a[rel="tag"]').each((_, el) => {
    const name = $(el).text().trim()
    const slug = extractSlug($(el).attr('href') || '')
    if (name && slug) genres.push({ name, slug })
  })

  if (genres.length === 0) {
    $('a[href*="/genres/"]').each((_, el) => {
      const name = $(el).text().trim()
      const slug = extractSlug($(el).attr('href') || '')
      appendUniqueGenre(genres, name, slug)
    })
  }

  return genres
}

export function scrapeGenreList(): Promise<Genre[]> {
  return cached('scrape:genre-list', GENRE_LIST_TTL, scrapeGenreListFresh)
}

async function scrapeGenreFresh(slug: string, page = 1): Promise<{ anime: GenreAnimeCard[]; totalPages: number }> {
  const url = page > 1 ? `${BASE_URL}/genres/${slug}/page/${page}/` : `${BASE_URL}/genres/${slug}/`
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)
  const anime: GenreAnimeCard[] = []

  $('.col-anime-con').each((_, el) => {
    const $el = $(el)
    anime.push({
      title: $el.find('.col-anime-title a').text().trim(),
      slug: extractAnimeSlug($el.find('.col-anime-title a').attr('href') || ''),
      thumbnail: $el.find('.col-anime-cover img').attr('src') || '',
      studio: $el.find('.col-anime-studio').text().trim(),
      episodes: $el.find('.col-anime-eps').text().trim(),
      rating: $el.find('.col-anime-rating').text().trim(),
      genres: $el.find('.col-anime-genre a').map((_, a) => $(a).text().trim()).get().join(', '),
      date: $el.find('.col-anime-date').text().trim(),
    })
  })

  return { anime, totalPages: getTotalPages($) }
}

export function scrapeGenre(slug: string, page = 1): Promise<{ anime: GenreAnimeCard[]; totalPages: number }> {
  return cached(`scrape:genre:${slug}:${page}`, LIST_TTL, () => scrapeGenreFresh(slug, page))
}
