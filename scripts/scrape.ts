import { runScrape } from '../server/utils/scrape-run'

const baseUrl = process.env.SCRAPE_URL || 'http://localhost:3000'
const secret = process.env.CRON_SECRET
const mode = process.argv.includes('--full') ? 'full' : 'cron'

async function main() {
  const res = await fetch(`${baseUrl}/api/internal/scrape?mode=${mode}`, {
    method: 'POST',
    headers: secret ? { 'x-cron-secret': secret } : {},
  })
  if (!res.ok) {
    console.error(`[scrape] HTTP ${res.status}: ${await res.text()}`)
    process.exit(1)
  }
  const result = await res.json()
  console.log(`[scrape] ${result.mode} finished in ${Math.round(result.durationMs / 1000)}s`)
}

main().catch((error) => {
  console.error('[scrape] fatal:', error instanceof Error ? error.message : error)
  process.exit(1)
})
