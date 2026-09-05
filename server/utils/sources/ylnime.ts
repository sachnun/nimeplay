import * as cheerio from 'cheerio'
import { sealStreamToken } from '../streamUrl'
import { fetchHTML } from './shared'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail } from './types'

const BASE_URL = 'https://ylnime.com'

function decodeHref(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function extractSeriesSlug(href: string): string {
  return decodeHref(href.match(/[?&]series=([^&]+)/)?.[1] || '')
}

function extractEpisodeSlug(href: string): string {
  return decodeHref(href.match(/[?&]episode=([^&]+)/)?.[1] || '')
}

function getTotalPages($: cheerio.CheerioAPI, path: string): number {
  const pages = $('a[href]').map((_, el) => {
    const href = $(el).attr('href') || ''
    const page = href.match(new RegExp(`${path.replace('.', '\\.')}\\?page=(\\d+)`))?.[1]
    return page ? Number(page) : 0
  }).get()
  return Math.max(1, ...pages)
}

function parseCards($: cheerio.CheerioAPI): ScrapedAnimeCard[] {
  return $('.card a[href*="?series="]').closest('.card').map((_, el) => {
    const $el = $(el)
    const link = $el.find('a[href*="?series="]').attr('href') || ''
    return {
      title: $el.find('.card-title').text().trim(),
      slug: extractSeriesSlug(link),
      thumbnail: $el.find('img.card-img-top').attr('src') || '',
      episode: '',
      day: $el.find('.badge-corner').text().trim(),
      date: '',
    }
  }).get()
}

async function scrapeOngoingFresh(page: number): Promise<ListResult> {
  const html = await fetchHTML(`${BASE_URL}/ongoing.php`)
  const $ = cheerio.load(html)
  return { anime: parseCards($), totalPages: 1 }
}

async function scrapeCompletedFresh(page: number): Promise<ListResult> {
  const url = page > 1 ? `${BASE_URL}/completed.php?page=${page}` : `${BASE_URL}/completed.php`
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)
  return { anime: parseCards($), totalPages: getTotalPages($, 'completed.php') }
}

function parseDetailGenres($: cheerio.CheerioAPI): { name: string; slug: string }[] {
  return $('.col-md-9 a[href*="?search="]').map((_, el) => {
    const name = $(el).text().replace(/,$/, '').trim()
    return { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') }
  }).get()
}

function parseDetailEpisodes($: cheerio.CheerioAPI, series: string): { title: string; slug: string; date: string }[] {
  return $('.list-group a[href*="&episode="]').map((_, el) => {
    const $el = $(el)
    const episodeId = extractEpisodeSlug($el.attr('href') || '')
    const title = $el.clone().find('.text-muted').remove().end().text().trim()
    return {
      title,
      slug: episodeId ? `${series}/${episodeId}` : '',
      date: $el.find('.text-muted').text().trim(),
    }
  }).get().filter(entry => entry.slug)
}

async function scrapeAnimeDetailFresh(slug: string): Promise<ScrapedAnimeDetail | null> {
  const html = await fetchHTML(`${BASE_URL}/index.php?series=${encodeURIComponent(slug)}`)
  const $ = cheerio.load(html)
  const title = $('.col-md-9 h1').first().text().trim()
  if (!title) return null

  const type = $('.col-md-9 span.border').first().text().trim()
  const year = $('.col-md-9 .fa-calendar-alt').parent().text().trim()
  const status = $('.col-md-9 span.fw-bold.fs-6').first().text().trim()

  return {
    title,
    japanese: '',
    score: '',
    producer: '',
    type,
    status,
    totalEpisode: '',
    duration: '',
    releaseDate: year,
    studio: '',
    genres: parseDetailGenres($),
    thumbnail: $('.col-md-3 img.img-fluid').attr('src') || '',
    synopsis: $('.col-md-9 p.text-light.opacity-75').first().text().trim(),
    episodes: parseDetailEpisodes($, slug),
  }
}

interface YlnimeStream {
  reso: string
  link: string
}

function parseStreams($: cheerio.CheerioAPI): YlnimeStream[] {
  const raw = $('script').map((_, el) => $(el).html() || '').get()
    .find(script => script.includes('const streams'))
  if (!raw) return []
  const match = raw.match(/const streams = (\[[\s\S]*?\]);/)
  if (!match) return []
  try {
    return JSON.parse(match[1]!) as YlnimeStream[]
  } catch {
    return []
  }
}

function providerName(link: string): string {
  try {
    return new URL(link).hostname.split('.').slice(-2, -1)[0] || 'Server'
  } catch {
    return 'Server'
  }
}

function groupByQuality(streams: YlnimeStream[]): EpisodeData['mirrors'] {
  const groups = new Map<string, { name: string; dataContent: string }[]>()
  for (const stream of streams) {
    const quality = stream.reso || 'SD'
    const list = groups.get(quality) ?? []
    list.push({ name: providerName(stream.link), dataContent: stream.link })
    groups.set(quality, list)
  }
  return [...groups.entries()].map(([quality, sources]) => ({ quality, sources }))
}

async function scrapeEpisodeFresh(slug: string): Promise<EpisodeData | null> {
  const [series, episodeId] = slug.split('/')
  if (!series || !episodeId) return null
  const url = `${BASE_URL}/index.php?series=${encodeURIComponent(series)}&episode=${encodeURIComponent(episodeId)}`
  const html = await fetchHTML(url)
  const $ = cheerio.load(html)
  const breadcrumb = $('.breadcrumb-item.active').text().trim()
  const animeTitle = $('.breadcrumb a[href*="?series="]').first().text().trim()
  const title = `${animeTitle} ${breadcrumb}`.trim()
  if (!title || !breadcrumb) return null

  const mirrors = await Promise.all(groupByQuality(parseStreams($)).map(async (mirror) => ({
    quality: mirror.quality,
    sources: await Promise.all(mirror.sources.map(async (source) => ({
      name: source.name,
      dataContent: await sealStreamToken(`ylnime:${source.dataContent}`),
    }))),
  })))

  return {
    title,
    animeSlug: series,
    animeTitle,
    defaultIframeSrc: '',
    mirrors,
    episodeNav: [],
    thumbnail: '',
  }
}

async function resolveMirror(opaque: string): Promise<string | null> {
  return opaque.startsWith('http') ? opaque : null
}

export const ylnime: AnimeSource = {
  id: 'ylnime',
  name: 'YLnime',
  baseUrl: BASE_URL,
  ongoingFresh: scrapeOngoingFresh,
  completedFresh: scrapeCompletedFresh,
  detailFresh: scrapeAnimeDetailFresh,
  episodeFresh: scrapeEpisodeFresh,
  resolveMirror,
}