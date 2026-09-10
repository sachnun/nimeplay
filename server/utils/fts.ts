export function toFtsQuery(query: string): string | null {
  const tokens = query.match(/[\p{L}\p{N}]+/gu)?.slice(0, 5) ?? []
  if (tokens.length === 0) return null
  return tokens.map(token => `"${token.replace(/"/g, '""')}"*`).join(' ')
}
