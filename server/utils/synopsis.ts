const SYNOPSIS_METADATA = /(?:^|\s)(?:\((?:Sources?|Written by|Adapted from)\b|\[Written by\b|Notes?\s*:|Source\s*:)|(?:^|\n)\s*Includes? episode\b/

export function cleanSynopsis(value: string | null | undefined): string {
  if (!value) return ''
  const text = value.replace(/\r\n?/g, '\n').trim()
  const cut = SYNOPSIS_METADATA.exec(text)
  return (cut ? text.slice(0, cut.index) : text).trim().replace(/\n{3,}/g, '\n\n')
}
