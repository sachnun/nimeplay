function unpackJS(packed: string): string | null {
  const match = packed.match(/eval\(function\(p,a,c,k,e,d\)\{[^}]+\}\('([\s\S]*?)',(\d+),(\d+),'([^']*)'/)
  if (!match) return null

  const [, pRaw, aStr, cStr, kStr] = match
  let p = pRaw
  const a = Number.parseInt(aStr)
  let c = Number.parseInt(cStr)
  const k = kStr.split('|')

  while (c--) {
    if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c])
  }
  return p
}

function extractHls(html: string): { hls4: string | null; hls2: string | null } {
  const unpacked = unpackJS(html)
  if (!unpacked) return { hls4: null, hls2: null }

  const linksMatch = unpacked.match(/var\s+links\s*=\s*\{([^}]+)\}/)
  if (!linksMatch) return { hls4: null, hls2: null }

  const body = linksMatch[1]
  return {
    hls4: body.match(/"hls4"\s*:\s*"([^"]+)"/)?.[1] ?? null,
    hls2: body.match(/"hls2"\s*:\s*"([^"]+)"/)?.[1] ?? null,
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
