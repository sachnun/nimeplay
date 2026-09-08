import * as cheerio from 'cheerio'
import { sealStreamToken } from '../streamUrl'
import { cleanTitleWithRules, fetchHTML, parseEpisodeDate, type TitleCleanupRule } from './shared'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail } from './types'

const BASE_URL = 'https://gomunime.org'

const SCRAPER_TITLE_CLEANUP: TitleCleanupRule[] = [
  /\s*Subtitle\s+Indonesia/gi,
  /\s*Sub\s+Indo(nesia)?/gi,
  /\s*Streaming\s+HD/gi,
  /\s*Nonton\s+Anime\s+/gi,
  /\s*Nonton\s+/gi,
]

function cleanTitle(title: string): string {
  return cleanTitleWithRules(title, SCRAPER_TITLE_CLEANUP)
}

function extractAnimeSlug(href: string): string {
  return href.match(/\/anime\/([^/]+)/)?.[1] ?? ''
}

function extractEpisodeSlug(href: string): string {
  return href.match(/\/nonton\/([^/]+)/)?.[1] ?? ''
}

function getTotalPages($: cheerio.CheerioAPI): number {
  const current = Number.parseInt($('.gm-hal span.current').text().trim(), 10) || 1
  const pages = $('.gm-hal a').map((_, el) => {
    const text = $(el).text().trim()
    const num = Number.parseInt(text, 10)
    if (!Number.isNaN(num)) return num
    const match = $(el).attr('href')?.match(/\/page\/(\d+)/)
    return match ? Number.parseInt(match[1]!, 10) : 0
  }).get()
  return Math.max(current, ...pages)
}

function parseCards($: cheerio.CheerioAPI): ScrapedAnimeCard[] {
  const anime: ScrapedAnimeCard[] = []
  $('.gm-c').each((_, el) => {
    const $el = $(el)
    const href = $el.attr('href') || ''
    const epSlug = extractEpisodeSlug(href)
    const seriesSlug = extractAnimeSlug(href)
    const slug = seriesSlug || (epSlug ? epSlug.replace(/-episode-\d+.*$/i, '') : '')
    if (!slug) return

    const title = cleanTitle($el.find('h3').text().trim())
    const rawEp = $el.find('.gm-b-ep').text().trim()
    const episode = rawEp ? (rawEp.match(/\d+/)?.[0] ? `Episode ${rawEp.match(/\d+/)?.[0]}` : rawEp) : ''
    const rating = $el.find('.gm-b-rt').text().replace('★', '').trim()
    const meta = $el.find('.gm-c-mt').text().trim()
    const date = meta.includes('•') ? meta.split('•').slice(-1)[0]!.trim() : meta

    anime.push({
      title,
      slug,
      thumbnail: $el.find('img').attr('src') || '',
      episode,
      day: '',
      date,
      rating: rating || undefined,
    })
  })
  return anime
}

async function scrapeOngoingFresh(page: number): Promise<ListResult> {
  const url = page > 1 ? `${BASE_URL}/page/${page}/` : `${BASE_URL}/`
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)
  return { anime: parseCards($), totalPages: getTotalPages($) }
}

async function scrapeCompletedFresh(page: number): Promise<ListResult> {
  const url = page > 1 ? `${BASE_URL}/completed/page/${page}/` : `${BASE_URL}/completed/`
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)
  return { anime: parseCards($), totalPages: getTotalPages($) }
}

function parseGenres($: cheerio.CheerioAPI): { name: string; slug: string }[] {
  return $('.gm-chips .gm-chip').map((_, el) => ({
    name: $(el).text().trim(),
    slug: $(el).attr('href')?.split('/genre/')[1]?.replace(/\//g, '') || '',
  })).get().filter(g => g.name && g.slug)
}

function parseDetailEpisodes($: cheerio.CheerioAPI): { title: string; slug: string; date: string }[] {
  return $('.gm-eplist a.gm-ep-row').map((_, el) => {
    const $el = $(el)
    const href = $el.attr('href') || ''
    const slug = extractEpisodeSlug(href)
    return {
      title: $el.find('.gm-ep-n').text().trim(),
      slug,
      date: '',
    }
  }).get().filter(e => e.slug)
}

async function scrapeAnimeDetailFresh(slug: string): Promise<ScrapedAnimeDetail | null> {
  const html = await fetchHTML(`${BASE_URL}/anime/${slug}/`)
  const $ = cheerio.load(html)
  const rawTitle = $('.gm-det-tx h1').text().trim()
  if (!rawTitle) return null

  const title = cleanTitle(rawTitle)
  const status = $('.gm-hero-badge .b2').text().trim()
  const type = $('.gm-hero-badge .b1').text().trim()
  const score = $('.gm-hero-badge .b3').text().replace('★', '').trim()
  const thumbnail = $('.gm-det-po img').attr('src') || ''
  const synopsis = $('.gm-sin').text().trim()
  const totalEpisode = $('.gm-det-info div:contains("EPISODE") span').text().trim()
  const duration = $('.gm-det-info div:contains("DURASI") span').text().trim()
  const studio = $('.gm-det-info div:contains("STUDIO") span').text().trim()

  return {
    title,
    japanese: '',
    score,
    producer: '',
    type,
    status,
    totalEpisode,
    duration,
    releaseDate: '',
    studio,
    genres: parseGenres($),
    thumbnail,
    synopsis,
    episodes: parseDetailEpisodes($),
  }
}

function parseEpisodeNav($: cheerio.CheerioAPI): EpisodeData['episodeNav'] {
  const nav: EpisodeData['episodeNav'] = []
  $('.gm-sec a').each((_, el) => {
    const href = $(el).attr('href') || ''
    if (href.includes('/nonton/')) {
      const slug = extractEpisodeSlug(href)
      const num = slug.match(/episode-(\d+)/)?.[1]
      nav.push({
        title: num ? `Episode ${num}` : $(el).text().trim(),
        slug,
      })
    }
  })
  return nav
}

function hostProviderName(url: string): string {
  try {
    const host = new URL(url).hostname
    const parts = host.split('.')
    return parts.length >= 2 ? parts[parts.length - 2]! : host
  } catch {
    return 'Server'
  }
}

async function scrapeEpisodeFresh(slug: string): Promise<EpisodeData | null> {
  const html = await fetchHTML(`${BASE_URL}/nonton/${slug}/`)
  const $ = cheerio.load(html)

  const h1 = $('h1').text().trim()
  if (!h1) return null

  const title = cleanTitle(h1)
  const animeHref = $('.gm-nav-ep a.utama').attr('href') || ''
  const animeSlug = extractAnimeSlug(animeHref)
  const iframeSrc = $('.gm-player iframe, iframe').attr('src') || ''

  const mirrors: EpisodeData['mirrors'] = []
  if (iframeSrc) {
    const provider = hostProviderName(iframeSrc)
    mirrors.push({
      quality: 'HD',
      sources: [
        {
          name: provider,
          dataContent: await sealStreamToken(`gomunime:${iframeSrc}`),
        },
      ],
    })
  }

  return {
    title,
    animeSlug,
    animeTitle: cleanTitle($('.gm-nav-ep a.utama').text() || title),
    defaultIframeSrc: iframeSrc,
    mirrors,
    episodeNav: parseEpisodeNav($),
    thumbnail: '',
  }
}

async function resolveMirror(opaque: string): Promise<string | null> {
  return opaque.startsWith('http') ? opaque : null
}

export const gomunime: AnimeSource = {
  id: 'gomunime',
  name: 'Gomunime',
  baseUrl: BASE_URL,
  priority: 2,
  ongoingFresh: scrapeOngoingFresh,
  completedFresh: scrapeCompletedFresh,
  detailFresh: scrapeAnimeDetailFresh,
  episodeFresh: scrapeEpisodeFresh,
  resolveMirror,
}
