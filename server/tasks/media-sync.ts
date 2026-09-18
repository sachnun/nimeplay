import { runMediaSync } from '../utils/refresh'
import { triggerInternal } from '../utils/internal'

export default defineTask({
  meta: {
    name: 'media-sync',
    description: 'Mirror queued media into object storage',
  },
  async run() {
    await triggerInternal('media-sync', runMediaSync)
    return { result: 'ok' }
  },
})
