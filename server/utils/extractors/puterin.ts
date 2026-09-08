const PUTERIN_HOSTS = ['puterin.biz', 'putarin.biz']

export function isPuterin(url: string): boolean {
  try {
    const parsed = new URL(url)
    return PUTERIN_HOSTS.some(host => parsed.hostname.endsWith(host))
  } catch {
    return false
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function extractPuterin(iframeUrl: string, html: string): Promise<string | null> {
  const pxMatch = html.match(/window\.__PX\s*=\s*({[^}]+})/)
  if (!pxMatch || !pxMatch[1]) return null

  try {
    const px = JSON.parse(pxMatch[1]) as { n: string; d: string; v?: string }
    if (!px.n || !px.d) return null

    const origin = new URL(iframeUrl).origin
    const pkUrl = `${origin}/api/pk?n=${encodeURIComponent(px.n)}`

    const pkRes = await fetch(pkUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Referer: iframeUrl,
      },
      signal: AbortSignal.timeout(6000),
    })
    if (!pkRes.ok) return null
    const keyHex = (await pkRes.text()).trim()
    if (keyHex.length < 64) return null

    const raw = base64ToBytes(px.d)
    const iv = raw.subarray(0, 12)
    const ct = raw.subarray(12)

    const key = await crypto.subtle.importKey('raw', hexToBytes(keyHex) as BufferSource, { name: 'AES-GCM' }, false, ['decrypt'])
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, ct as BufferSource)
    const playerConfig = JSON.parse(new TextDecoder().decode(decrypted)) as { file?: string }

    if (!playerConfig.file) return null
    return new URL(playerConfig.file, origin).toString()
  } catch {
    return null
  }
}
