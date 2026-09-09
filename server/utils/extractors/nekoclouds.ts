import { getSpoofHeaders } from '../spoof'

const AUTHORIZE_TIMEOUT_MS = 8000

export function isNekoclouds(url: string): boolean {
  return url.toLowerCase().includes('nekoclouds.com')
}

function extractMediaId(embedUrl: string, html: string): string | null {
  const fromUrl = embedUrl.match(/\/embed\/([A-Za-z0-9]+)/)?.[1]
  if (fromUrl) return fromUrl
  const fromHtml = html.match(/mediaId:\s*"([A-Za-z0-9]+)"/)?.[1]
  if (fromHtml) return fromHtml
  const fromAuthorize = html.match(/\/playback\/([A-Za-z0-9]+)\/authorize/)?.[1]
  return fromAuthorize ?? null
}

function extractCsrf(html: string): string | null {
  return html.match(/<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/)?.[1] ?? null
}

function collectCookies(res: Response): string {
  const anyHeaders = res.headers as Headers & { getSetCookie?: () => string[] }
  const setCookies = typeof anyHeaders.getSetCookie === 'function'
    ? anyHeaders.getSetCookie()
    : res.headers.get('set-cookie') ? [res.headers.get('set-cookie') as string] : []
  return setCookies.map((cookie) => cookie.split(';')[0]?.trim()).filter(Boolean).join('; ')
}

export async function extractNekoclouds(embedUrl: string, html: string): Promise<string | null> {
  try {
    const parsed = new URL(embedUrl)
    const origin = `${parsed.protocol}//${parsed.host}`
    let mediaId = extractMediaId(embedUrl, html)
    let csrf = extractCsrf(html)
    let cookies = ''

    if (!mediaId || !csrf) {
      const res = await fetch(embedUrl, {
        headers: getSpoofHeaders(embedUrl, 'navigate'),
        signal: AbortSignal.timeout(AUTHORIZE_TIMEOUT_MS),
      })
      if (!res.ok) return null
      cookies = collectCookies(res)
      const freshHtml = await res.text()
      mediaId = mediaId ?? extractMediaId(embedUrl, freshHtml)
      csrf = csrf ?? extractCsrf(freshHtml)
      if (!mediaId || !csrf) return null
    } else {
      try {
        const res = await fetch(embedUrl, {
          headers: getSpoofHeaders(embedUrl, 'navigate'),
          signal: AbortSignal.timeout(AUTHORIZE_TIMEOUT_MS),
        })
        if (res.ok) cookies = collectCookies(res)
      } catch {
      }
    }

    if (!mediaId || !csrf) return null

    const headers = getSpoofHeaders(embedUrl, 'cors')
    const authRes = await fetch(`${origin}/playback/${mediaId}/authorize`, {
      method: 'POST',
      headers: {
        ...headers,
        Accept: 'application/json',
        Referer: embedUrl,
        'X-CSRF-TOKEN': csrf,
        'X-Requested-With': 'XMLHttpRequest',
        ...(cookies ? { Cookie: cookies } : {}),
      },
      signal: AbortSignal.timeout(AUTHORIZE_TIMEOUT_MS),
    })
    if (!authRes.ok) return null
    const data = await authRes.json() as { status?: string, manifest_url?: string }
    if (data.status !== 'ok' || !data.manifest_url) return null
    return data.manifest_url.startsWith('http') ? data.manifest_url : `${origin}${data.manifest_url}`
  } catch {
    return null
  }
}
