import { cloudflareEnv } from './env'

interface KVNamespaceLike {
  get(key: string, type: 'text'): Promise<string | null>
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>
  delete(key: string): Promise<void>
}

const KEY_PREFIX = 'nimeplay:v1:'
const MAX_KEY_TAIL = 400

export function kvNamespace(): KVNamespaceLike | null {
  const env = cloudflareEnv() as { CACHE?: KVNamespaceLike }
  const binding = env?.CACHE
  if (!binding || typeof binding.get !== 'function' || typeof binding.put !== 'function') return null
  return binding
}

export function kvKey(namespace: string, key: string | number): string {
  const tail = encodeURIComponent(`${namespace}:${String(key)}`)
  return `${KEY_PREFIX}${tail.slice(0, MAX_KEY_TAIL)}`
}

export async function kvGet<T>(namespace: string, key: string | number): Promise<{ hit: boolean, value?: T }> {
  const kv = kvNamespace()
  if (!kv) return { hit: false }
  const raw = await kv.get(kvKey(namespace, key), 'text')
  if (raw === null) return { hit: false }
  try {
    return { hit: true, value: JSON.parse(raw) as T }
  }
  catch {
    return { hit: false }
  }
}

export async function kvPut(namespace: string, key: string | number, value: unknown, ttlMs: number): Promise<void> {
  const kv = kvNamespace()
  if (!kv) return
  const ttlSec = Math.max(60, Math.round(ttlMs / 1000))
  await kv.put(kvKey(namespace, key), JSON.stringify(value), { expirationTtl: ttlSec })
}

export async function kvDel(namespace: string, key: string | number): Promise<void> {
  const kv = kvNamespace()
  if (!kv) return
  await kv.delete(kvKey(namespace, key))
}
