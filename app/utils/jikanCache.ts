const STORAGE_KEY = 'nimeplay:jikan'

function getMap(): Record<string, number> {
  if (!import.meta.client) return {}
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function getMalId(animeSlug: string): number | null {
  return getMap()[animeSlug] ?? null
}

export function saveMalId(animeSlug: string, malId: number): void {
  if (!import.meta.client) return
  const map = getMap()
  map[animeSlug] = malId
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}
