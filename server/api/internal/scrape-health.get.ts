import { getQuery } from 'h3'
import { getScrapeHealth } from '../../utils/scrape-run'

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Scrape health',
    description: 'Returns pending structure and metadata queues with oldest age, recent metadata failures, last run stats, and active scrape config.',
    parameters: [
      { name: 'mode', in: 'query', required: false, schema: { type: 'string', enum: ['cron', 'full'], default: 'cron' } },
    ],
    responses: {
      '200': { description: 'Scrape health payload' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const mode = getQuery(event).mode === 'full' ? 'full' : 'cron'
  return getScrapeHealth(mode)
})
