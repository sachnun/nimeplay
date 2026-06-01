interface CacheEntry<T> {
  expiresAt: number
  value: Promise<T>
}

const store = new Map<string, CacheEntry<unknown>>()

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = store.get(key) as CacheEntry<T> | undefined
  if (hit && hit.expiresAt > now) return hit.value

  const value = load().catch((error) => {
    store.delete(key)
    throw error
  })
  store.set(key, { expiresAt: now + ttlMs, value })
  return value
}
