import { runOngoingSync } from '../utils/refresh'
import { triggerInternal } from '../utils/internal'

export default defineTask({
  meta: {
    name: 'ongoing-sync',
    description: 'Scrape ongoing catalog and refresh fresh episodes',
  },
  async run() {
    await triggerInternal('ongoing-sync', runOngoingSync)
    return { result: 'ok' }
  },
})
