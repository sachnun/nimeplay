import * as cheerio from 'cheerio/slim'
import { Effect, Result } from 'effect'
import { sealStreamToken } from '../media/stream'
import { Http } from '../net/http'
import { cleanTitleWithRules, type TitleCleanupRule } from './shared'
import type { AnimeSource, EpisodeData, ListResult, ScrapedAnimeCard, ScrapedAnimeDetail, SourceEffect } from './types'

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

function extractAnimeSlug(href: string): string {
  return href.match(/\/anime\/([^/]+)/)?.[1] ?? ''
}

function extractEpisodeSlug(href: string): string {
  return href.match(/\/episode\/([^/]+)/)?.[1] ?? ''
}

function getTotalPages($: cheerio.CheerioAPI): number {
  const lastPage = $('.pagenavix a.page-numbers').not('.next').last().text().trim()
  return Number.parseInt(lastPage, 10) || 1
}

function parseAnimeCards($: cheerio.CheerioAPI): ScrapedAnimeCard[] {
  const anime: ScrapedAnimeCard[] = []
  $('.detpost').each((_, el) => {
    const $el = $(el)
    const slug = extractAnimeSlug($el.find('.thumb a').attr('href') || '')
    if (!slug) return
    anime.push({
      slug,
      date: $el.find('.newnime').text().trim(),
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

function parseDetailEpisodes($: cheerio.CheerioAPI): { title: string; slug: string; date: string }[] {
  return $('.episodelist ul li')
    .map((_, el) => {
      const $el = $(el)
      const link = $el.find('a').attr('href') || ''
      if (!link.includes('/episode/')) return null
      return {
        title: $el.find('a').text().trim(),
        slug: extractEpisodeSlug(link),
        date: $el.find('.zeebr').text().trim(),
      }
    })
    .get()
}

function infoValue(info: Record<string, string>, key: string): string {
  return info[key] || ''
}

function titleFromInfo(info: Record<string, string>, fallback: string): string {
  return infoValue(info, 'Judul') || fallback
}

function scrapeAnimeListFresh(path: string, page: number): SourceEffect<ListResult> {
  return Effect.gen(function* () {
    const url = page > 1 ? `${BASE_URL}/${path}/page/${page}/` : `${BASE_URL}/${path}/`
    const http = yield* Http
    const html = yield* http.html(url)
    const $ = cheerio.load(html)
    return { anime: parseAnimeCards($), totalPages: getTotalPages($) }
  })
}

function scrapeAnimeDetailFresh(slug: string): SourceEffect<ScrapedAnimeDetail | null> {
  return Effect.gen(function* () {
    const http = yield* Http
    const html = yield* http.html(`${BASE_URL}/anime/${slug}/`)
    const $ = cheerio.load(html)
    const h1Title = cleanTitle($('.jdlrx h1').text().trim())
    if (!h1Title) return null

    const info = parseInfo($)

    return {
      title: titleFromInfo(info, h1Title),
      japanese: infoValue(info, 'Japanese'),
      status: infoValue(info, 'Status'),
      releaseDate: infoValue(info, 'Tanggal Rilis'),
      episodes: parseDetailEpisodes($),
    }
  })
}

function parseEpisodeAnimeSlug($: cheerio.CheerioAPI): string {
  return extractAnimeSlug(
    $('.flir a[href*="/anime/"]').attr('href') ||
      $('.alert-info a[href*="/anime/"]').attr('href') ||
      $('a[href*="/anime/"][rel="follow"]').attr('href') ||
      '',
  )
}

function parseMirrorQuality($ul: ReturnType<cheerio.CheerioAPI>): string {
  const classMatch = ($ul.attr('class') || '').match(/m(\d+p)/)
  const qualityText = $ul.find('span').first().text().trim()
  const textMatch = qualityText.match(/(\d+p)/)
  return classMatch?.[1] ?? textMatch?.[1] ?? qualityText
}

function parseMirrorSources($: cheerio.CheerioAPI, $ul: ReturnType<cheerio.CheerioAPI>) {
  const sources = $ul
    .find('a[data-content]')
    .map((_, a) => ({
      name: $(a).text().trim(),
      dataContent: $(a).attr('data-content') || '',
    }))
    .get()
    .filter(source => source.name && source.dataContent)
  return Effect.forEach(
    sources,
    source =>
      Effect.promise(async () => ({
        ...source,
        dataContent: await sealStreamToken(`otakudesu:${source.dataContent}`),
      })),
    { concurrency: 'unbounded' },
  )
}

function parseEpisodeMirrors($: cheerio.CheerioAPI): Effect.Effect<EpisodeData['mirrors']> {
  return Effect.forEach(
    $('.mirrorstream ul').toArray(),
    ul =>
      Effect.gen(function* () {
        const $ul = $(ul)
        const quality = parseMirrorQuality($ul)
        const sources = yield* parseMirrorSources($, $ul)
        return sources.length > 0 && quality !== '360p' ? { quality, sources } : null
      }),
    { concurrency: 'unbounded' },
  ).pipe(
    Effect.map(mirrors => mirrors.filter((mirror): mirror is EpisodeData['mirrors'][number] => mirror !== null)),
  )
}

function parseEpisodeNav($: cheerio.CheerioAPI): EpisodeData['episodeNav'] {
  return $('#selectcog option')
    .map((_, el) => {
      const value = $(el).attr('value') || ''
      return value && value !== '0' && value.includes('/episode/')
        ? { title: $(el).text().trim(), slug: extractEpisodeSlug(value) }
        : null
    })
    .get()
}

function scrapeEpisodeFresh(slug: string): SourceEffect<EpisodeData | null> {
  return Effect.gen(function* () {
    const http = yield* Http
    const html = yield* http.html(`${BASE_URL}/episode/${slug}/`)
    const $ = cheerio.load(html)
    const title = $('.posttl').text().trim()
    if (!title) return null

    return {
      title,
      animeSlug: parseEpisodeAnimeSlug($),
      animeTitle: $('.cukder .infozingle p span').first().text().replace('Credit:', '').trim(),
      mirrors: yield* parseEpisodeMirrors($),
      episodeNav: parseEpisodeNav($),
      thumbnail: $('.cukder img').attr('src') || '',
    }
  })
}

function resolveMirror(opaque: string): SourceEffect<string | null> {
  return Effect.gen(function* () {
    const http = yield* Http
    const result = yield* Effect.result(
      Effect.gen(function* () {
        const nonceData = yield* http.form(
          `${BASE_URL}/wp-admin/admin-ajax.php`,
          'action=aa1208d27f29ca340c92c66d1926f13f',
          `${BASE_URL}/`,
        )
        const nonce = nonceData.data as string
        const decoded = JSON.parse(atob(opaque)) as { id?: string | number; i?: string | number; q?: string }
        const params = new URLSearchParams({
          id: decoded.id?.toString() || '',
          i: decoded.i?.toString() || '',
          q: decoded.q ?? '',
          nonce,
          action: '2a3505c93b0035d3f455df82bf976b84',
        })
        const mirrorData = yield* http.form(`${BASE_URL}/wp-admin/admin-ajax.php`, params.toString(), `${BASE_URL}/`)
        if (!mirrorData.data) return null
        const html = atob(mirrorData.data as string)
        return cheerio.load(html)('iframe').attr('src') || ''
      }),
    )
    return Result.isSuccess(result) ? result.success : null
  })
}

export const otakudesu: AnimeSource = {
  id: 'otakudesu',
  name: 'Otakudesu',
  baseUrl: BASE_URL,
  ongoingFresh: page => scrapeAnimeListFresh('ongoing-anime', page),
  completedFresh: page => scrapeAnimeListFresh('complete-anime', page),
  detailFresh: scrapeAnimeDetailFresh,
  episodeFresh: scrapeEpisodeFresh,
  resolveMirror,
}
