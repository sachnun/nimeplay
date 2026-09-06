import * as cheerio from 'cheerio'
import { sealStreamToken } from '../streamUrl'
import { cleanTitleWithRules, type TitleCleanupRule } from '../title'
import { fetchHTML, parseEpisodeDate, postForm } from './shared'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail } from './types'

const BASE_URL = 'https://otakudesu.blog'

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

function parseEpsType(raw: string): { day: string; rating?: string } {
  const text = raw.replace(/[^\w\s.]/g, '').trim()
  if (/^\d+(\.\d+)?$/.test(text)) return { day: '', rating: text }
  return { day: text }
}

function getTotalPages($: cheerio.CheerioAPI): number {
  const lastPage = $('.pagenavix a.page-numbers').not('.next').last().text().trim()
  return Number.parseInt(lastPage) || 1
}

function parseAnimeCards($: cheerio.CheerioAPI): ScrapedAnimeCard[] {
  const anime: ScrapedAnimeCard[] = []
  $('.detpost').each((_, el) => {
    const $el = $(el)
    const epztipe = parseEpsType($el.find('.epztipe').text())
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

async function scrapeAnimeListFresh(path: string, page: number): Promise<ListResult> {
  const url = page > 1 ? `${BASE_URL}/${path}/page/${page}/` : `${BASE_URL}/${path}/`
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)
  return { anime: parseAnimeCards($), totalPages: getTotalPages($) }
}

async function scrapeAnimeDetailFresh(slug: string): Promise<ScrapedAnimeDetail | null> {
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
    mirrors: await parseEpisodeMirrors($),
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

async function parseMirrorSources($: cheerio.CheerioAPI, $ul: ReturnType<cheerio.CheerioAPI>) {
  const sources = $ul.find('a[data-content]').map((_, a) => ({
    name: $(a).text().trim(),
    dataContent: $(a).attr('data-content') || '',
  })).get()
  return Promise.all(sources.map(async (source) => ({
    ...source,
    dataContent: source.dataContent ? await sealStreamToken(`otakudesu:${source.dataContent}`) : '',
  })))
}

async function parseEpisodeMirrors($: cheerio.CheerioAPI): Promise<EpisodeData['mirrors']> {
  const uls = $('.mirrorstream ul').toArray()
  const mirrors = await Promise.all(uls.map(async (ul) => {
    const $ul = $(ul)
    const quality = parseMirrorQuality($ul)
    const sources = await parseMirrorSources($, $ul)
    return sources.length > 0 && quality !== '360p' ? { quality, sources } : null
  }))
  return mirrors.filter((mirror): mirror is EpisodeData['mirrors'][number] => mirror !== null)
}

function parseEpisodeNav($: cheerio.CheerioAPI): EpisodeData['episodeNav'] {
  return $('#selectcog option').map((_, el) => {
    const value = $(el).attr('value') || ''
    return value && value !== '0' && value.includes('/episode/')
      ? { title: $(el).text().trim(), slug: extractEpisodeSlug(value) }
      : null
  }).get()
}

async function resolveMirror(opaque: string): Promise<string | null> {
  try {
    const nonceData = await postForm(`${BASE_URL}/wp-admin/admin-ajax.php`, 'action=aa1208d27f29ca340c92c66d1926f13f', BASE_URL + '/')
    const nonce = nonceData.data as string
    const decoded = JSON.parse(atob(opaque))
    const params = new URLSearchParams({
      id: decoded.id?.toString() || '',
      i: decoded.i?.toString() || '',
      q: decoded.q || '',
      nonce,
      action: '2a3505c93b0035d3f455df82bf976b84',
    })
    const mirrorData = await postForm(`${BASE_URL}/wp-admin/admin-ajax.php`, params.toString(), BASE_URL + '/')
    if (!mirrorData.data) return null
    const html = atob(mirrorData.data as string)
    return cheerio.load(html)('iframe').attr('src') || ''
  } catch {
    return null
  }
}

export const otakudesu: AnimeSource = {
  id: 'otakudesu',
  name: 'Otakudesu',
  baseUrl: BASE_URL,
  priority: 2,
  ongoingFresh: (page) => scrapeAnimeListFresh('ongoing-anime', page),
  completedFresh: (page) => scrapeAnimeListFresh('complete-anime', page),
  detailFresh: scrapeAnimeDetailFresh,
  episodeFresh: scrapeEpisodeFresh,
  resolveMirror,
}