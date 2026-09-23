import { getSpoofHeaders } from '../net/spoof'
import { proxyFetch } from '../media/proxy'

export type TitleCleanupRule = RegExp | [RegExp, string]

export function cleanTitleWithRules(title: string, rules: TitleCleanupRule[]): string {
  return rules.reduce((value, rule) => {
    if (Array.isArray(rule)) return value.replace(rule[0], rule[1])
    return value.replace(rule, '')
  }, title).trim()
}

const HTML_TIMEOUT_MS = 8000
const HTML_ATTEMPTS = 2
const POST_TIMEOUT_MS = 8000

export async function fetchHTML(url: string, timeoutMs = HTML_TIMEOUT_MS): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < HTML_ATTEMPTS; attempt++) {
    try {
      const res = await proxyFetch(url, {
        headers: getSpoofHeaders(url, 'navigate'),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`)
      return await res.text()
    }
    catch (error) {
      lastError = error
      if (error instanceof Error && /Failed to fetch .*?: \d{3}/.test(error.message)) throw error
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`Failed to fetch ${url}`)
}

export async function postForm(url: string, body: string, referer: string): Promise<Record<string, unknown>> {
  const headers = getSpoofHeaders(referer, 'cors')
  headers['Content-Type'] = 'application/x-www-form-urlencoded'
  const res = await proxyFetch(url, {
    method: 'POST',
    headers,
    body,
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
  })
  return res.json()
}

const ID_MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  mei: 4,
  jun: 5,
  jul: 6,
  agu: 7,
  sep: 8,
  okt: 9,
  nov: 10,
  des: 11,
}

export function parseEpisodeDate(raw: string): Date | null {
  const value = raw.trim()
  if (!value) return null
  const lower = value.toLowerCase()
  if (lower === 'hari ini') return new Date()
  if (lower === 'kemarin') return new Date(Date.now() - 86_400_000)

  const relativeMatch = lower.match(/^(\d+)\s+(min|minute|menit|hour|jam|day|hari|week|minggu|month|bulan|year|tahun)\w*\s+lalu$/)
  if (relativeMatch) {
    const num = Number(relativeMatch[1])
    const unit = relativeMatch[2]
    const msMap: Record<string, number> = {
      min: 60 * 1000,
      minute: 60 * 1000,
      menit: 60 * 1000,
      hour: 3600 * 1000,
      jam: 3600 * 1000,
      day: 86400 * 1000,
      hari: 86400 * 1000,
      week: 7 * 86400 * 1000,
      minggu: 7 * 86400 * 1000,
      month: 30 * 86400 * 1000,
      bulan: 30 * 86400 * 1000,
      year: 365 * 86400 * 1000,
      tahun: 365 * 86400 * 1000,
    }
    const ms = unit ? msMap[unit] ?? 0 : 0
    const delta = ms * num
    return new Date(Date.now() - delta)
  }

  const match = value.match(/^(\d{1,2})\s+([A-Za-z]+),?\s*(\d{4})?$/)
  if (!match) return null
  const day = Number(match[1])
  const month = ID_MONTHS[match[2]!.toLowerCase().slice(0, 3)]
  if (month === undefined || day < 1 || day > 31) return null
  let year = match[3] ? Number(match[3]) : new Date().getUTCFullYear()
  if (!match[3] && month > new Date().getUTCMonth() + 1) year -= 1
  const date = new Date(Date.UTC(year, month, day))
  return date.getUTCDate() === day ? date : null
}

const EPISODE_SUFFIX = /[-–|:]?\s*(episode|eps)\s*\d+.*$/i
const TRAILING_NUMBER = /\s*\d+\s*(\(end\))?\s*$/i

function episodeLabel(title: string): string {
  return title.replace(EPISODE_SUFFIX, '').replace(TRAILING_NUMBER, '').trim()
}

function labelKey(label: string): string {
  return label.toLowerCase().normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '')
}

function keyMatches(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  return a.length >= 6 && b.length >= 6 && (a.includes(b) || b.includes(a))
}

export function keepSeriesEpisodes<T extends { title: string }>(seriesTitle: string, seriesSlug: string, episodes: T[]): T[] {
  const counts = new Map<string, number>()
  for (const episode of episodes) {
    const key = labelKey(episodeLabel(episode.title))
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const labeled = [...counts.values()].reduce((sum, count) => sum + count, 0)
  if (labeled === 0) return episodes
  let dominant = ''
  let dominantCount = 0
  for (const [key, count] of counts) {
    if (count > dominantCount) {
      dominant = key
      dominantCount = count
    }
  }
  const trusted = dominantCount >= 2 && dominantCount >= labeled * 0.7
  const seriesKey = labelKey(seriesTitle)
  const slugKey = labelKey(seriesSlug)
  return episodes.filter((episode) => {
    const key = labelKey(episodeLabel(episode.title))
    if (!key) return true
    if (keyMatches(key, seriesKey) || keyMatches(key, slugKey)) return true
    return trusted && keyMatches(key, dominant)
  })
}
