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
