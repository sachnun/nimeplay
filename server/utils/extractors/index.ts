import { getSpoofHeaders } from '../spoof'
import { isVidhide, extractVidhide } from './vidhide'
import { isDesuStreamHd, extractDesuStream } from './desustream'
import { isDesuDrive, extractDesuDrive } from './desudrive'
import { isFiledon, extractFiledon } from './filedon'

export const CORS_PROXY = 'https://cors.io/?url='

async function fetchIframeHTML(iframeUrl: string): Promise<string> {
  const res = await fetch(CORS_PROXY + encodeURIComponent(iframeUrl), {
    headers: getSpoofHeaders(iframeUrl, 'iframe'),
  })
  const data = await res.json()
  return data.body
}

export async function probeIframeUrl(iframeUrl: string): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(CORS_PROXY + encodeURIComponent(iframeUrl), {
      headers: getSpoofHeaders(iframeUrl, 'iframe'),
      signal: controller.signal,
    })
    clearTimeout(timer)
    const data = await res.json()
    return !!data.body && data.body.length > 100
  } catch {
    clearTimeout(timer)
    return false
  }
}

export async function extractStreamUrl(iframeUrl: string): Promise<{ proxiedUrl: string | null; iframeUrl: string }> {
  try {
    const html = await fetchIframeHTML(iframeUrl)
    if (!html) return { proxiedUrl: null, iframeUrl }

    if (isVidhide(iframeUrl)) return { proxiedUrl: await extractVidhide(iframeUrl, html), iframeUrl }
    if (isDesuStreamHd(iframeUrl)) return { proxiedUrl: await extractDesuStream(iframeUrl, html), iframeUrl }
    if (isDesuDrive(iframeUrl)) return { proxiedUrl: await extractDesuDrive(iframeUrl, html), iframeUrl }
    if (isFiledon(iframeUrl)) return { proxiedUrl: await extractFiledon(iframeUrl, html), iframeUrl }

    const vidhideUrl = await extractVidhide(iframeUrl, html)
    if (vidhideUrl) return { proxiedUrl: vidhideUrl, iframeUrl }

    const mp4Match = html.match(/<source\s+src="([^"]*googlevideo[^"]*)"/)
    if (mp4Match) return { proxiedUrl: mp4Match[1], iframeUrl }

    const driveUrl = await extractDesuDrive(iframeUrl, html)
    if (driveUrl) return { proxiedUrl: driveUrl, iframeUrl }

    return { proxiedUrl: null, iframeUrl }
  } catch {
    return { proxiedUrl: null, iframeUrl }
  }
}
