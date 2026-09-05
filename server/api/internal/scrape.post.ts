import { getQuery } from 'h3'
import { runScrape } from '../../utils/scrape-run'

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Run anime scraper',
    description: 'Incrementally syncs anime and episodes from Otakudesu, plus metadata from MyAnimeList. Scheduled scraping runs in-worker via the scrape task; this route is for on-demand runs. Bypasses the in-memory scrape cache so every run fetches fresh data.',
    parameters: [
      { name: 'mode', in: 'query', required: false, schema: { type: 'string', enum: ['cron', 'full'], default: 'cron' } },
    ],
    responses: {
      '200': { description: 'Scrape completed; skipped=true when another run was in progress' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const mode = getQuery(event).mode === 'full' ? 'full' : 'cron'
  return runScrape({ mode })
})