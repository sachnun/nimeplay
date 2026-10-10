function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function normalizeSlugTitle(slug: string): string {
  return decodeSafe(slug)
    .replace(/%[0-9a-f]{2}/gi, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s*[([][^)\]]*[)\]]\s*/g, ' ')
    .replace(/\s*[|/]+\s*/g, ' ')
    .replace(/\s+sub(title)?\s*indo(nesia)?\b.*$/i, '')
    .replace(/\s+sub\s*$/i, '')
    .replace(/[!?:,.'"“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
