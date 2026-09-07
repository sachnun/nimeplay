export function thumb(src: string | null | undefined, width = 200, quality = 30, format = 'avif'): string {
  if (!src) return ''
  if (!src.startsWith('/r2/')) return src
  const sep = src.includes('?') ? '&' : '?'
  return `${src}${sep}w=${width}&q=${quality}&fm=${format}`
}
