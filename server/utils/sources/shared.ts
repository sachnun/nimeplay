import { getSpoofHeaders } from '../spoof'

const HTML_TIMEOUT_MS = 8000
const POST_TIMEOUT_MS = 8000

export async function fetchHTML(url: string): Promise<string> {
  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: getSpoofHeaders(url, 'navigate'),
      signal: AbortSignal.timeout(HTML_TIMEOUT_MS),
    })
    if (res.ok) return await res.text()
    lastError = new Error(`Failed to fetch ${url}: ${res.status}`)
  }
  throw lastError!
}

export async function postForm(url: string, body: string, referer: string): Promise<Record<string, unknown>> {
  const headers = getSpoofHeaders(referer, 'cors')
  headers['Content-Type'] = 'application/x-www-form-urlencoded'
  const res = await fetch(url, {
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

/**
 * Parse an Indonesian date into a UTC midnight Date. Accepts the detail-page
 * format ("7 Agustus,2026") and the list-page format ("24 Agu", year
 * implied). "Hari ini"/"Kemarin" map to today/yesterday. Returns null for
 * anything unparseable.
 */
export function parseEpisodeDate(raw: string): Date | null {
  const value = raw.trim()
  if (!value) return null
  const lower = value.toLowerCase()
  if (lower === 'hari ini') return new Date()
  if (lower === 'kemarin') return new Date(Date.now() - 86_400_000)
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