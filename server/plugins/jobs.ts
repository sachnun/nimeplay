import { withPool } from '../utils/db'
import { runJob, type JobKind } from '../utils/jobs'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:queue', async ({ batch }) => {
    for (const message of batch.messages) {
      try {
        const kind = (message.body as { kind?: JobKind }).kind
        if (!kind) {
          message.ack()
          continue
        }
        await withPool(() => runJob(kind))
        message.ack()
      }
      catch (error) {
        console.warn('[jobs] failed:', error instanceof Error ? error.message : error)
        message.retry()
      }
    }
  })
})
