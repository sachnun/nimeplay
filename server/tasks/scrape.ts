import { runScrape } from '../utils/scrape-run'

interface CloudflareContext {
  env: Record<string, string | undefined>
}

export default defineTask({
  meta: {
    name: 'scrape',
    description: 'Run one scrape batch (structure + metadata)',
  },
  async run({ payload, context }) {
    const mode = payload?.mode === 'full' ? 'full' : 'cron'
    const env = (context as { cloudflare?: CloudflareContext } | undefined)?.cloudflare?.env
    if (env?.CRON_SECRET) {
      const startedAt = Date.now()
      const res = await fetch('https://nimeplay.sachnun.workers.dev/api/internal/scrape?mode=' + mode, {
        method: 'POST',
        headers: {
          'x-cron-secret': env.CRON_SECRET,
          'content-type': 'application/json',
        },
        signal: AbortSignal.timeout(25000),
      })
      const body = await res.text()
      console.log(`[scrape:task] self-fetch ${res.status} in ${Date.now() - startedAt}ms`)
      let parsed: unknown = null
      try {
        parsed = JSON.parse(body)
      }
      catch {
        parsed = body
      }
      return { selfFetch: res.status, result: parsed }
    }
    const result = await runScrape({ mode })
    console.log('[scrape:task]', JSON.stringify(result))
    return { result }
  },
})