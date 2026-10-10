import * as cheerio from 'cheerio/slim'
import { Effect } from 'effect'
import { sealStreamToken } from '../media/stream'
import { Http } from '../net/http'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail, SourceEffect } from './types'

const BASE_URL = 'https://ylnime.com'
const TIMEOUT_MS = 15000

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
  const pages = $('a[href]')
    .map((_, el) => {
      const href = $(el).attr('href') || ''
      const page = href.match(new RegExp(`${path.replace('.', '\\.')}\\?page=(\\d+)`))?.[1]
      return page ? Number(page) : 0
    })
    .get()
  return Math.max(1, ...pages)
}

function parseCards($: cheerio.CheerioAPI): ScrapedAnimeCard[] {
  return $('.card a[href*="?series="]')
    .closest('.card')
    .map((_, el) => {
      const $el = $(el)
      const link = $el.find('a[href*="?series="]').attr('href') || ''
      return {
        slug: extractSeriesSlug(link),
        date: '',
      }
    })
    .get()
}

function scrapeOngoingFresh(page: number): SourceEffect<ListResult> {
  return Effect.gen(function* () {
    if (page > 1) return { anime: [], totalPages: 1 }
    const http = yield* Http
    const html = yield* http.html(`${BASE_URL}/ongoing.php`, TIMEOUT_MS)
    const $ = cheerio.load(html)
    return { anime: parseCards($), totalPages: 1 }
  })
}

function scrapeCompletedFresh(page: number): SourceEffect<ListResult> {
  return Effect.gen(function* () {
    const url = page > 1 ? `${BASE_URL}/completed.php?page=${page}` : `${BASE_URL}/completed.php`
    const http = yield* Http
    const html = yield* http.html(url, TIMEOUT_MS)
    const $ = cheerio.load(html)
    return { anime: parseCards($), totalPages: getTotalPages($, 'completed.php') }
  })
}

function parseDetailEpisodes($: cheerio.CheerioAPI, series: string): { title: string; slug: string; date: string }[] {
  return $('.list-group a[href*="&episode="]')
    .map((_, el) => {
      const $el = $(el)
      const episodeId = extractEpisodeSlug($el.attr('href') || '')
      const title = $el.clone().find('.text-muted').remove().end().text().trim()
      return {
        title,
        slug: episodeId ? `${series}@${episodeId}` : '',
        date: $el.find('.text-muted').text().trim(),
      }
    })
    .get()
    .filter(entry => entry.slug)
}

function scrapeAnimeDetailFresh(slug: string): SourceEffect<ScrapedAnimeDetail | null> {
  return Effect.gen(function* () {
    const http = yield* Http
    const html = yield* http.html(`${BASE_URL}/index.php?series=${encodeURIComponent(slug)}`, TIMEOUT_MS)
    const $ = cheerio.load(html)
    const title = $('.col-md-9 h1').first().text().trim()
    if (!title) return null

    const year = $('.col-md-9 .fa-calendar-alt').parent().text().trim()
    const status = $('.col-md-9 span.fw-bold.fs-6').first().text().trim()

    return {
      title,
      japanese: '',
      status,
      releaseDate: year,
      episodes: parseDetailEpisodes($, slug),
    }
  })
}

interface YlnimeStream {
  reso: string
  link: string
}

function parseStreams($: cheerio.CheerioAPI): YlnimeStream[] {
  const raw = $('script')
    .map((_, el) => $(el).html() || '')
    .get()
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

function scrapeEpisodeFresh(slug: string): SourceEffect<EpisodeData | null> {
  return Effect.gen(function* () {
    const at = slug.lastIndexOf('@')
    if (at <= 0 || at === slug.length - 1) return null
    const series = slug.slice(0, at)
    const episodeId = slug.slice(at + 1)
    const url = `${BASE_URL}/index.php?series=${encodeURIComponent(series)}&episode=${encodeURIComponent(episodeId)}`
    const http = yield* Http
    const html = yield* http.html(url, TIMEOUT_MS)
    const $ = cheerio.load(html)
    const breadcrumb = $('.breadcrumb-item.active').text().trim()
    const animeTitle = $('.breadcrumb a[href*="?series="]').first().text().trim()
    const title = `${animeTitle} ${breadcrumb}`.trim()
    if (!title || !breadcrumb) return null

    const mirrors = yield* Effect.forEach(
      groupByQuality(parseStreams($)),
      mirror =>
        Effect.gen(function* () {
          const sources = yield* Effect.forEach(
            mirror.sources,
            source =>
              Effect.promise(async () => ({
                name: source.name,
                dataContent: await sealStreamToken(`ylnime:${source.dataContent}`),
              })),
            { concurrency: 'unbounded' },
          )
          return { quality: mirror.quality, sources }
        }),
      { concurrency: 'unbounded' },
    )

    return {
      title,
      animeSlug: series,
      animeTitle,
      mirrors,
      episodeNav: [],
      thumbnail: '',
    }
  })
}

function resolveMirror(opaque: string): Effect.Effect<string | null> {
  return Effect.succeed(opaque.startsWith('http') ? opaque : null)
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
