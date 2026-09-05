interface Entry {
  expiresAt: number
  value: Promise<unknown>
}

const tables = new Map<string, Map<string, Entry>>()

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

    const value = load().catch((error) => {
      table!.delete(k)
      throw error
    })
    table.set(k, { expiresAt: now + ttlMs, value })
    return value
  },
}