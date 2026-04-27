interface CacheEntry<T> {
  expiresAt: number
  value: Promise<T>
}

const store = new Map<string, CacheEntry<unknown>>()
let cleanupAt = 0

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  if (cleanupAt <= now) {
    cleanupAt = now + 60 * 1000
    for (const [entryKey, entry] of store) {
      if (entry.expiresAt <= now) store.delete(entryKey)
    }
  }

  const hit = store.get(key) as CacheEntry<T> | undefined
  if (hit && hit.expiresAt > now) return hit.value

  const value = load().catch((error) => {
    store.delete(key)
    throw error
  })
  store.set(key, { expiresAt: now + ttlMs, value })
  return value
}
