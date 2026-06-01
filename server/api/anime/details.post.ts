import { scrapeAnimeDetail } from '../../utils/scraper'
import { setApiCorsHeaders } from '../../utils/cors'

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const body = await readBody<{ slugs: string[] }>(event)
  if (!body?.slugs?.length) return []

  const seen = new Set<string>()
  const unique = body.slugs.map((s) => s.trim()).filter((s) => s && !seen.has(s) && seen.add(s))

  const results = await Promise.allSettled(unique.map(async (slug) => {
    try {
      const anime = await scrapeAnimeDetail(slug)
      return { slug, anime }
    } catch {
      return { slug, anime: null }
    }
  }))

  return results.map((r) => r.status === 'fulfilled' ? r.value : { slug: '', anime: null })
})
