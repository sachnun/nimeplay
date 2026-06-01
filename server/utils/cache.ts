import { Ref, Effect } from 'effect'

interface Entry<T> {
  expiresAt: number
  value: Promise<T>
}

function table<K extends string | number>() {
  const ref: Ref.Ref<Map<K, Entry<unknown>>> = Effect.runSync(Ref.make(new Map()))

  return {
    get(key: K, ttlMs: number, load: () => Promise<unknown>): Promise<unknown> {
      const now = Date.now()
      const hit = Effect.runSync(Ref.get(ref)).get(key)
      if (hit && hit.expiresAt > now) return hit.value

      const value = load().catch((error) => {
        Effect.runSync(Ref.update(ref, (m) => { m.delete(key); return m }))
        throw error
      })

      Effect.runSync(Ref.update(ref, (m) => { m.set(key, { expiresAt: now + ttlMs, value }); return m }))
      return value
    },
  }
}

const ongoing = table<number>()
const completed = table<number>()
const anime = table<string>()
const episode = table<string>()
const search = table<string>()
const genreList = table<string>()
const genrePage = table<string>()
const mirror = table<string>()
const prepare = table<string>()

export const cache = {
  ongoing: {
    get(page: number, ttl: number, load: () => Promise<unknown>) { return ongoing.get(page, ttl, load) },
  },
  completed: {
    get(page: number, ttl: number, load: () => Promise<unknown>) { return completed.get(page, ttl, load) },
  },
  anime: {
    get(slug: string, ttl: number, load: () => Promise<unknown>) { return anime.get(slug, ttl, load) },
  },
  episode: {
    get(slug: string, ttl: number, load: () => Promise<unknown>) { return episode.get(slug, ttl, load) },
  },
  search: {
    get(query: string, ttl: number, load: () => Promise<unknown>) { return search.get(query, ttl, load) },
  },
  genre: {
    list(ttl: number, load: () => Promise<unknown>) { return genreList.get('list', ttl, load) },
    page(slug: string, page: number, ttl: number, load: () => Promise<unknown>) { return genrePage.get(`${slug}:${page}`, ttl, load) },
  },
  mirror: {
    get(content: string, ttl: number, load: () => Promise<unknown>) { return mirror.get(content, ttl, load) },
  },
  prepare: {
    get(extract: boolean, content: string, ttl: number, load: () => Promise<unknown>) {
      return prepare.get(`${extract}:${content}`, ttl, load)
    },
  },
}