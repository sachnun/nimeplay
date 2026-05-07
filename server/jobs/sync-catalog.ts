import { syncCatalogAnime } from '../services/animeSync'

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)
}

function numericArg(name: string): number | undefined {
  const value = argValue(name)
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

syncCatalogAnime({
  limit: numericArg('limit'),
  offset: numericArg('offset'),
  concurrency: numericArg('concurrency'),
  refresh: process.argv.includes('--refresh'),
  onProgress(progress) {
    console.log(`[${progress.processed}/${progress.total}] ${progress.ok ? 'ok' : 'failed'} ${progress.slug}${progress.error ? `: ${progress.error}` : ''}`)
  },
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2))
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
