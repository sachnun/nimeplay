import * as cheerio from 'cheerio'
import { timeoutSignal } from './fetch'
import { getSpoofHeaders } from './spoof'

const BASE_URL = 'https://otakudesu.blog'
const LIST_TTL = 3 * 60 * 1000
const DETAIL_TTL = 30 * 60 * 1000
const EPISODE_TTL = 30 * 60 * 1000
const GENRE_LIST_TTL = 12 * 60 * 60 * 1000
const SEARCH_TTL = 2 * 60 * 1000
const MIRROR_TTL = 10 * 60 * 1000
const HTML_TIMEOUT_MS = 8000
const POST_TIMEOUT_MS = 8000

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

function cleanTitle(title: string): string {
  return title
    .replace(/\s*\+\s*OVA\b/gi, '')
    .replace(/\s*\+\s*Special\b/gi, '')
    .replace(/\s*Subtitle\s+Indonesia/gi, '')
    .replace(/\s*Sub\s+Indo(nesia)?/gi, '')
    .replace(/\s*\(Episode\s+\d+\s*[-–—]\s*\d+(\s*\+\s*OVA)?\s*\)/i, '')
    .replace(/\s*\(Episode\s+\d+\s*[-–—]\s*\d+\s*End\s*\)/i, '')
    .replace(/\s*Sub\s+Indo\s*:\s*Episode\s+\d+\s*[-–—]\s*\d+\s*\(End\)/i, '')
    .replace(/\s+BD\b/, '')
    .trim()
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

function parseEpztipe(raw: string): { day: string; rating?: string } {
  const text = raw.replace(/[^\w\s.]/g, '').trim()
  if (/^\d+(\.\d+)?$/.test(text)) return { day: '', rating: text }
  return { day: text }
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
  const url = page > 1 ? `${BASE_URL}/ongoing-anime/page/${page}/` : `${BASE_URL}/ongoing-anime/`
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)
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

  const lastPage = $('.pagenavix a.page-numbers').not('.next').last().text().trim()
  return { anime, totalPages: Number.parseInt(lastPage) || 1 }
}

export function scrapeOngoing(page = 1): Promise<{ anime: AnimeCard[]; totalPages: number }> {
  return scrapeOngoingCached(page)
}

const scrapeOngoingCached = defineCachedFunction(scrapeOngoingFresh, {
  name: 'scrape-ongoing',
  maxAge: LIST_TTL / 1000,
  getKey: (page = 1) => String(page),
})

async function scrapeCompletedFresh(page = 1): Promise<{ anime: AnimeCard[]; totalPages: number }> {
  const url = page > 1 ? `${BASE_URL}/complete-anime/page/${page}/` : `${BASE_URL}/complete-anime/`
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)
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

  const lastPage = $('.pagenavix a.page-numbers').not('.next').last().text().trim()
  return { anime, totalPages: Number.parseInt(lastPage) || 1 }
}

export function scrapeCompleted(page = 1): Promise<{ anime: AnimeCard[]; totalPages: number }> {
  return scrapeCompletedCached(page)
}

const scrapeCompletedCached = defineCachedFunction(scrapeCompletedFresh, {
  name: 'scrape-completed',
  maxAge: LIST_TTL / 1000,
  getKey: (page = 1) => String(page),
})

async function scrapeAnimeDetailFresh(slug: string): Promise<AnimeDetail | null> {
  const html = await fetchHTML(`${BASE_URL}/anime/${slug}/`)
  const $ = cheerio.load(html)
  const h1Title = cleanTitle($('.jdlrx h1').text().trim())
  if (!h1Title) return null

  const info: Record<string, string> = {}
  $('.infozingle p span').each((_, el) => {
    const text = $(el).text()
    const colonIndex = text.indexOf(':')
    if (colonIndex > -1) {
      const key = text.slice(0, colonIndex).replace(/\*\*/g, '').trim()
      info[key] = text.slice(colonIndex + 1).trim()
    }
  })

  const genres: { name: string; slug: string }[] = []
  $('.infozingle a[rel="tag"]').each((_, el) => {
    genres.push({ name: $(el).text().trim(), slug: extractSlug($(el).attr('href') || '') })
  })

  const episodes: { title: string; slug: string; date: string }[] = []
  $('.episodelist ul li').each((_, el) => {
    const $el = $(el)
    const link = $el.find('a').attr('href') || ''
    if (link.includes('/episode/')) {
      episodes.push({
        title: $el.find('a').text().trim(),
        slug: extractEpisodeSlug(link),
        date: $el.find('.zeebr').text().trim(),
      })
    }
  })

  return {
    title: info.Judul || h1Title,
    japanese: info.Japanese || '',
    score: info.Skor || '',
    producer: info.Produser || '',
    type: info.Tipe || '',
    status: info.Status || '',
    totalEpisode: info['Total Episode'] || '',
    duration: info.Durasi || '',
    releaseDate: info['Tanggal Rilis'] || '',
    studio: info.Studio || '',
    genres,
    thumbnail: $('.fotoanime img').attr('src') || '',
    synopsis: $('.sinopc p').text().trim(),
    episodes,
  }
}

export function scrapeAnimeDetail(slug: string): Promise<AnimeDetail | null> {
  return scrapeAnimeDetailCached(slug)
}

const scrapeAnimeDetailCached = defineCachedFunction(scrapeAnimeDetailFresh, {
  name: 'scrape-anime-detail',
  maxAge: DETAIL_TTL / 1000,
  getKey: (slug) => slug,
})

async function scrapeEpisodeFresh(slug: string): Promise<EpisodeData | null> {
  const html = await fetchHTML(`${BASE_URL}/episode/${slug}/`)
  const $ = cheerio.load(html)
  const title = $('.posttl').text().trim()
  if (!title) return null

  let animeSlug = extractAnimeSlug($('.flir a[href*="/anime/"]').attr('href') || '')
  if (!animeSlug) {
    animeSlug = extractAnimeSlug(
      $('.alert-info a[href*="/anime/"]').attr('href') || $('a[href*="/anime/"][rel="follow"]').attr('href') || '',
    )
  }

  const mirrors: EpisodeData['mirrors'] = []
  $('.mirrorstream ul').each((_, ul) => {
    const $ul = $(ul)
    const className = $ul.attr('class') || ''
    const classMatch = className.match(/m(\d+p)/)
    const qualityText = $ul.find('span').first().text().trim()
    const textMatch = qualityText.match(/(\d+p)/)
    const quality = classMatch?.[1] ?? textMatch?.[1] ?? qualityText
    const sources: { name: string; dataContent: string }[] = []

    $ul.find('a[data-content]').each((_, a) => {
      sources.push({ name: $(a).text().trim(), dataContent: $(a).attr('data-content') || '' })
    })

    if (sources.length > 0 && quality !== '360p') mirrors.push({ quality, sources })
  })

  const episodeNav: { title: string; slug: string }[] = []
  $('#selectcog option').each((_, el) => {
    const val = $(el).attr('value') || ''
    if (val && val !== '0' && val.includes('/episode/')) {
      episodeNav.push({ title: $(el).text().trim(), slug: extractEpisodeSlug(val) })
    }
  })

  return {
    title,
    animeSlug,
    animeTitle: $('.cukder .infozingle p span').first().text().replace('Credit:', '').trim(),
    defaultIframeSrc: $('.responsive-embed-stream iframe').attr('src') || '',
    mirrors,
    episodeNav,
    thumbnail: $('.cukder img').attr('src') || '',
  }
}

export function scrapeEpisode(slug: string): Promise<EpisodeData | null> {
  return scrapeEpisodeCached(slug)
}

const scrapeEpisodeCached = defineCachedFunction(scrapeEpisodeFresh, {
  name: 'scrape-episode',
  maxAge: EPISODE_TTL / 1000,
  getKey: (slug) => slug,
})

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
  return resolveMirrorCached(dataContent)
}

const resolveMirrorCached = defineCachedFunction(resolvemirrorFresh, {
  name: 'resolve-mirror',
  maxAge: MIRROR_TTL / 1000,
  getKey: (dataContent) => dataContent,
})

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
  return scrapeSearchCached(query)
}

const scrapeSearchCached = defineCachedFunction(scrapeSearchFresh, {
  name: 'scrape-search',
  maxAge: SEARCH_TTL / 1000,
  getKey: (query) => query.toLowerCase(),
})

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
      if (name && slug && !genres.some((g) => g.slug === slug)) genres.push({ name, slug })
    })
  }

  return genres
}

export function scrapeGenreList(): Promise<Genre[]> {
  return scrapeGenreListCached()
}

const scrapeGenreListCached = defineCachedFunction(scrapeGenreListFresh, {
  name: 'scrape-genre-list',
  maxAge: GENRE_LIST_TTL / 1000,
  getKey: () => 'all',
})

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

  const lastPage = $('.pagenavix a.page-numbers').not('.next').last().text().trim()
  return { anime, totalPages: Number.parseInt(lastPage) || 1 }
}

export function scrapeGenre(slug: string, page = 1): Promise<{ anime: GenreAnimeCard[]; totalPages: number }> {
  return scrapeGenreCached(slug, page)
}

const scrapeGenreCached = defineCachedFunction(scrapeGenreFresh, {
  name: 'scrape-genre',
  maxAge: LIST_TTL / 1000,
  getKey: (slug, page = 1) => `${slug}:${page}`,
})
