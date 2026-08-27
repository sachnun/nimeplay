import { runScrape } from '../server/utils/scrape-run'

runScrape()
  .then((result) => {
    console.log(`[scrape] ${result.mode} finished in ${Math.round(result.durationMs / 1000)}s`)
  })
  .catch((error) => {
    console.error('[scrape] fatal:', error)
    process.exit(1)
  })