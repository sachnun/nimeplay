interface Entry {
  expiresAt: number
  value: Promise<unknown>
}

const tables = new Map<string, Map<string, Entry>>()
const MAX_ENTRIES_PER_NAMESPACE = 500

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('cache load timed out')), ms)
    promise.then(
      value => { clearTimeout(timer); resolve(value) },
      error => { clearTimeout(timer); reject(error) },
    )
  })
}

export const cache = {
  get(namespace: string, key: string | number, ttlMs: number, load: () => Promise<unknown>): Promise<unknown> {
    let table = tables.get(namespace)
    if (!table) {
      table = new Map()
      tables.set(namespace, table)
    }
    const k = String(key)
    const now = Date.now()
    const hit = table.get(k)
    if (hit && hit.expiresAt > now) return hit.value

    const pending = withTimeout(load(), Math.max(ttlMs, 15000))

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
  },
  clear(namespace?: string): void {
    if (namespace) tables.delete(namespace)
    else tables.clear()
  },
}
