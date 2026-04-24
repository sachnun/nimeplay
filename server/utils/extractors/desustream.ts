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
