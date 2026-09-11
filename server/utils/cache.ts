import { kvDel, kvGet, kvPut } from './kv'

interface Entry {
  expiresAt: number
  value: Promise<unknown>
}

const tables = new Map<string, Map<string, Entry>>()
const MAX_ENTRIES_PER_NAMESPACE = 500

const KV_NAMESPACES: Record<string, true> = {
  genres: true,
  metadata: true,
}

function pruneTable(table: Map<string, Entry>, now: number): void {
  for (const [key, entry] of table) {
    if (entry.expiresAt <= now) table.delete(key)
    if (table.size <= MAX_ENTRIES_PER_NAMESPACE) break
  }
  while (table.size > MAX_ENTRIES_PER_NAMESPACE) {
    const oldest = table.keys().next()
    if (oldest.done) break
    table.delete(oldest.value)
  }
}

function useKv(namespace: string, options?: { kv?: boolean }): boolean {
  if (options?.kv === false) return false
  return KV_NAMESPACES[namespace] === true
}

function shouldPersist(namespace: string, value: unknown): boolean {
  if (namespace === 'search') return Array.isArray(value) && value.length > 0
  return true
}

export const cache = {
  get(namespace: string, key: string | number, ttlMs: number, load: () => Promise<unknown>, options?: { kv?: boolean }): Promise<unknown> {
    let table = tables.get(namespace)
    if (!table) {
      table = new Map()
      tables.set(namespace, table)
    }
    const k = String(key)
    const now = Date.now()
    const hit = table.get(k)
    if (hit && hit.expiresAt > now) return hit.value

    const pending = (async () => {
      if (useKv(namespace, options)) {
        try {
          const cached = await kvGet(namespace, k)
          if (cached.hit) return cached.value
        }
        catch {}
      }
      const fresh = await load()
      if (useKv(namespace, options) && shouldPersist(namespace, fresh)) {
        try {
          await kvPut(namespace, k, fresh, ttlMs)
        }
        catch {}
      }
      return fresh
    })()

    const tracked = pending.catch((error) => {
      if (table!.get(k)?.value === tracked) table!.delete(k)
      throw error
    })
    table.set(k, { expiresAt: now + ttlMs, value: tracked })
    pruneTable(table, now)
    return tracked
  },
  peek(namespace: string, key: string | number): Promise<unknown> | undefined {
    const table = tables.get(namespace)
    if (!table) return undefined
    const hit = table.get(String(key))
    if (!hit || hit.expiresAt <= Date.now()) return undefined
    return hit.value
  },
  delete(namespace: string, key: string | number): void {
    tables.get(namespace)?.delete(String(key))
    if (KV_NAMESPACES[namespace]) {
      kvDel(namespace, String(key)).catch(() => {})
    }
  },
  clear(namespace?: string): void {
    if (namespace) tables.delete(namespace)
    else tables.clear()
  },
}
