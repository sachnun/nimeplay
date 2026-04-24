export function isDesuDrive(url: string): boolean {
  return url.includes('/desudrive/')
}

export async function extractDesuDrive(_iframeUrl: string, html: string): Promise<string | null> {
  const match = html.match(/otakudesu\('(\{[^']+\})'\)/)
  if (!match) return null

  try {
    const data = JSON.parse(match[1])
    return data.file || null
  } catch {
    return null
  }
}
