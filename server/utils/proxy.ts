const PROXY = 'http://unroxy.koyeb.app'
const DEFAULT_POOL = 'id'
const POOL_OVERRIDES: [string, string][] = [
  ['sokuja.net', 'pl'],
  ['sokuja.uk', 'pl'],
]
const BYPASS_HOSTS = [
  'api.jikan.moe',
  'myanimelist.net',
  'malcdn.com',
  'mega.nz',
  'mega.co.nz',
  'github.io',
]

let enabled = false

export function enableProxy(): void {
  enabled = true
}

function matches(host: string, suffix: string): boolean {
  return host === suffix || host.endsWith(`.${suffix}`)
}

export function proxyUrl(input: string): string {
  if (!enabled) return input
  let host: string
  try {
    host = new URL(input).hostname
  }
  catch {
    return input
  }
  if (BYPASS_HOSTS.some(suffix => matches(host, suffix))) return input
  const pool = POOL_OVERRIDES.find(([suffix]) => matches(host, suffix))?.[1] ?? DEFAULT_POOL
  return `${PROXY}/${pool}/${input}`
}

export function proxyFetch(input: string, init?: RequestInit): Promise<Response> {
  return fetch(proxyUrl(input), init)
}
