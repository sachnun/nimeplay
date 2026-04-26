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
