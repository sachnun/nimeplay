import { createError, getHeader, getQuery } from 'h3'
import { runScrape } from '../../utils/scrape-run'

let running = false

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Run anime scraper',
    description: 'Incrementally syncs anime and episodes from Otakudesu, plus metadata from MyAnimeList. Intended for an external cron job; requires the `x-cron-secret` header to match the CRON_SECRET environment variable. Bypasses the in-memory scrape cache so every run fetches fresh data.',
    parameters: [
      { name: 'x-cron-secret', in: 'header', required: true, schema: { type: 'string' } },
      { name: 'mode', in: 'query', required: false, schema: { type: 'string', enum: ['cron', 'full'], default: 'cron' } },
    ],
    responses: {
      '200': { description: 'Scrape completed' },
      '401': { description: 'Missing or invalid x-cron-secret' },
      '409': { description: 'A scrape is already running' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const secret = getHeader(event, 'x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid or missing cron secret' })
  }
  if (running) {
    throw createError({ statusCode: 409, statusMessage: 'A scrape is already running' })
  }
  const mode = getQuery(event).mode === 'full' ? 'full' : 'cron'
  running = true
  try {
    return await runScrape({ mode })
  }
  finally {
    running = false
  }
})