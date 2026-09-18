import { runFinishedSync } from '../utils/refresh'
import { triggerInternal } from '../utils/internal'

export default defineTask({
  meta: {
    name: 'finished-sync',
    description: 'Backfill completed lists from vendors',
  },
  async run() {
    await triggerInternal('finished-sync', runFinishedSync)
    return { result: 'ok' }
  },
})
