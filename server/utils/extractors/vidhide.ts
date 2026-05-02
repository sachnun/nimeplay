const EMPTY_HLS = { hls4: null, hls2: null }

function toBase(num: number, radix: number): string {
  return num.toString(radix)
}

function replaceToken(value: string, token: string, replacement: string) {
  return value.replace(new RegExp(`\\b${token}\\b`, 'g'), replacement)
}

function unpackJS(packed: string): string | null {
  const match = packed.match(/eval\(function\(p,a,c,k,e,d\)\{[^}]+\}\('([\s\S]*?)',(\d+),(\d+),'([^']*)'/)
  if (!match) return null

  const [, pRaw, aStr, cStr, kStr] = match
  if (!pRaw || !aStr || !cStr || !kStr) return null
  let p = pRaw
  const a = Number.parseInt(aStr)
  let c = Number.parseInt(cStr)
  const k = kStr.split('|')

  while (c--) {
    const replacement = k[c]
    if (replacement) p = replaceToken(p, toBase(c, a), replacement)
  }
  return p
}

function emptyHls(): { hls4: string | null; hls2: string | null } {
  return { ...EMPTY_HLS }
}

function extractLinksBody(unpacked: string): string | null {
  return unpacked.match(/var\s+links\s*=\s*\{([^}]+)\}/)?.[1] ?? null
}

function extractHlsValue(body: string, key: 'hls4' | 'hls2'): string | null {
  return body.match(new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`))?.[1] ?? null
}

function extractHls(html: string): { hls4: string | null; hls2: string | null } {
  const unpacked = unpackJS(html)
  if (!unpacked) return emptyHls()
  const body = extractLinksBody(unpacked)
  if (!body) return emptyHls()
  return {
    hls4: extractHlsValue(body, 'hls4'),
    hls2: extractHlsValue(body, 'hls2'),
  }
}

export function isVidhide(url: string): boolean {
  const lower = url.toLowerCase()
  return lower.includes('vidhide') || lower.includes('odvidhide')
}

export async function extractVidhide(iframeUrl: string, html: string): Promise<string | null> {
  const { hls4, hls2 } = extractHls(html)
  const parsed = new URL(iframeUrl)
  const origin = `${parsed.protocol}//${parsed.host}`
  if (hls4) return hls4.startsWith('http') ? hls4 : `${origin}${hls4}`
  if (hls2) return hls2
  return null
}
