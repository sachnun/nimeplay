import { asHttpUrl, isPlaceholderStreamUrl } from './hosts'
import { getSpoofHeaders } from '../spoof'

export function isOdcloud(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes('odcloud.net') || lower.includes('/dstream/odcdn')
}

function parseOdcloudHtml(html: string, base?: string): string | null {
  const candidates = [
    html.match(/videoURL\s*=\s*"([^"]+)"/)?.[1],
    html.match(/videoURL\s*=\s*'([^']+)'/)?.[1],
    html.match(/<source\s+[^>]*src="([^"]+)"/)?.[1],
    html.match(/<source\s+[^>]*src='([^']+)'/)?.[1],
    html.match(/file:\s*"(https?:\/\/[^"]+)"/)?.[1],
    html.match(/file:\s*'([^']+)'/)?.[1],
    html.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/)?.[0],
  ]
  for (const candidate of candidates) {
    const resolved = asHttpUrl(candidate, base)
    if (resolved && !isPlaceholderStreamUrl(resolved)) return resolved
  }
  return null
}

export async function extractOdcloud(embedUrl: string, html: string): Promise<string | null> {
  const direct = parseOdcloudHtml(html, embedUrl)
  if (direct) return direct
  try {
    const res = await fetch(embedUrl, {
      headers: getSpoofHeaders(embedUrl, 'iframe'),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    return parseOdcloudHtml(await res.text(), embedUrl)
  } catch {
    return null
  }
}
