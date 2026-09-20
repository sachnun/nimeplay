export function cleanSynopsis(value: string | null | undefined): string {
  if (!value) return ''
  let result = value.replace(/\r\n?/g, '\n').trim()
  let prev = ''
  while (prev !== result) {
    prev = result
    result = result
      .replace(/\s*\[Written by [^\]]*\]\s*$/i, '')
      .replace(/\s*\(Source:[^()]*\)\s*$/i, '')
      .trim()
  }
  return result.replace(/\n{3,}/g, '\n\n')
}
