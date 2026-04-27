import { getSpoofHeaders } from '../spoof'
import { timeoutSignal } from '../fetch'
import { isVidhide, extractVidhide } from './vidhide'
import { isDesuStreamHd, extractDesuStream } from './desustream'
import { isDesuDrive, extractDesuDrive } from './desudrive'
import { isFiledon, extractFiledon } from './filedon'

async function fetchIframeHTML(iframeUrl: string): Promise<string> {
  const res = await fetch(iframeUrl, {
    headers: getSpoofHeaders(iframeUrl, 'iframe'),
    signal: timeoutSignal(8000),
  })
  return res.text()
}

export async function probeIframeUrl(iframeUrl: string): Promise<boolean> {
  try {
    const res = await fetch(iframeUrl, {
      headers: getSpoofHeaders(iframeUrl, 'iframe'),
      signal: timeoutSignal(5000),
    })
    const body = await res.text()
    return body.length > 100
  } catch {
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
    if (mp4Match?.[1]) return { proxiedUrl: mp4Match[1], iframeUrl }

    const driveUrl = await extractDesuDrive(iframeUrl, html)
    if (driveUrl) return { proxiedUrl: driveUrl, iframeUrl }

    return { proxiedUrl: null, iframeUrl }
  } catch {
    return { proxiedUrl: null, iframeUrl }
  }
}
