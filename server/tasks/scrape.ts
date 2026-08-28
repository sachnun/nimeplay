import { runScrape } from '../utils/scrape-run'

export default defineTask({
  meta: {
    name: 'scrape',
    description: 'Run one scrape batch (structure + metadata)',
  },
  async run({ payload }) {
    const mode = payload?.mode === 'full' ? 'full' : 'cron'
    const result = await runScrape({ mode })
    console.log('[scrape:task]', JSON.stringify(result))
    return { result }
  },
})