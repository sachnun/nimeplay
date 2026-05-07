const WORKER_API_BASE_URL = 'https://nimeplay.sachnun.workers.dev'

function getApiBaseUrl() {
  if (import.meta.client && /^https?:$/.test(window.location.protocol)) return window.location.origin
  return WORKER_API_BASE_URL
}

export const API_BASE_URL = getApiBaseUrl()
export const TRPC_API_URL = `${API_BASE_URL}/api/trpc`
export const STREAM_API_URL = `${API_BASE_URL}/api/stream`
