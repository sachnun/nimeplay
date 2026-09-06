const HD_PATTERNS = [
  '/ondesu/new/hd/',
  '/desudesu/new/hd/',
  '/otakustream/new/',
  '/moedesu/new/hd/',
  '/otakuwatch',
  '/dstream/arcg',
]

export function isDesuStreamHd(url: string): boolean {
  return HD_PATTERNS.some((p) => url.includes(p))
}

export async function extractDesuStream(_iframeUrl: string, html: string): Promise<string | null> {
  const sourceMatch = html.match(/<source\s+src="([^"]+)"/)
  if (sourceMatch?.[1]) return sourceMatch[1]
  const playerjsMatch = html.match(/file:\s*"(https?:\/\/[^\"]+)"/)
  if (playerjsMatch?.[1]) return playerjsMatch[1]
  return null
}

export function isDesuDrive(url: string): boolean {
  return url.includes('/desudrive/')
}

export async function extractDesuDrive(_iframeUrl: string, html: string): Promise<string | null> {
  const match = html.match(/otakudesu\('(\{[^']+\})'\)/)
  if (!match) return null
  try {
    const raw = match[1]
    if (!raw) return null
    const data = JSON.parse(raw)
    return data.file || null
  } catch {
    return null
  }
}

export function isFiledon(url: string): boolean {
  return url.toLowerCase().includes('filedon')
}

export async function extractFiledon(_iframeUrl: string, html: string): Promise<string | null> {
  const match = html.match(/data-page="([^"]+)"/)
  if (!match) return null
  try {
    const raw = match[1]
    if (!raw) return null
    const decoded = raw
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&#039;/g, "'")
    const page = JSON.parse(decoded)
    const url = page?.props?.url
    return typeof url === 'string' && url.includes('r2.cloudflarestorage.com') ? url : null
  } catch {
    return null
  }
}
