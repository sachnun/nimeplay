interface EdgeCache {
  match(request: Request): Promise<Response | undefined>
  put(request: Request, response: Response): Promise<void>
}

function store(): EdgeCache | null {
  const global = globalThis as { caches?: { default?: EdgeCache } }
  return global.caches?.default ?? null
}

export function edgeCacheKey(url: URL): Request {
  return new Request(url.href, { method: 'GET' })
}

export function isCacheable(request: Request, response: Response): boolean {
  if (request.method !== 'GET') return false
  if (response.status !== 200) return false
  if (request.headers.has('authorization') || request.headers.has('cookie')) return false
  return true
}

export function readEdgeCache(url: URL): Promise<Response | null> {
  const cache = store()
  if (!cache) return Promise.resolve(null)
  return cache
    .match(edgeCacheKey(url))
    .then(hit => hit ?? null)
    .catch(() => null)
}

export function writeEdgeCache(url: URL, request: Request, response: Response): Promise<void> {
  const cache = store()
  if (!cache || !isCacheable(request, response)) return Promise.resolve()
  return cache
    .put(edgeCacheKey(url), response.clone())
    .then(() => undefined)
    .catch(() => undefined)
}
