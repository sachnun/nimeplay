interface ImpitClient {
  fetch: (input: string, init?: RequestInit) => Promise<Response>
}

interface ImpitModule {
  Impit: new (options: { browser: string }) => ImpitClient
}

const MANAGED_HEADERS = new Set([
  'user-agent',
  'sec-ch-ua',
  'sec-ch-ua-mobile',
  'sec-ch-ua-platform',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'upgrade-insecure-requests',
])

let clientPromise: Promise<ImpitClient | null> | null = null

function loadClient(): Promise<ImpitClient | null> {
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const specifier = 'impit'
        const mod = await import(/* @vite-ignore */ specifier) as ImpitModule
        return new mod.Impit({ browser: 'chrome' })
      }
      catch {
        return null
      }
    })()
  }
  return clientPromise
}

function stripManagedHeaders(headers: HeadersInit | undefined): Record<string, string> | undefined {
  if (!headers) return undefined
  const entries = headers instanceof Headers
    ? [...headers.entries()]
    : Array.isArray(headers)
      ? headers
      : Object.entries(headers)
  const out: Record<string, string> = {}
  for (const [key, value] of entries) {
    if (!MANAGED_HEADERS.has(key.toLowerCase())) out[key] = value
  }
  return out
}

export async function fetchImpersonated(url: string, init?: RequestInit): Promise<Response> {
  const client = await loadClient()
  if (!client) return fetch(url, init)
  return client.fetch(url, { ...init, headers: stripManagedHeaders(init?.headers) })
}
