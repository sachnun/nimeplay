import type { AnimeSummary } from '#lib/types'

export function fetchAnimeSummaries(fetchFn: typeof fetch, malIds: number[]): Promise<AnimeSummary[]> {
  if (malIds.length === 0) return Promise.resolve([])
  const params = new URLSearchParams()
  for (const malId of malIds) params.append('malId', String(malId))
  return fetchFn(`/api/summaries?${params.toString()}`)
    .then(response => {
      if (!response.ok) throw new Error(`Request failed: ${response.status}`)
      return response.json() as Promise<{ data: AnimeSummary[] }>
    })
    .then(response => response.data)
}
