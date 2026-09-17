import { runMetadataSync } from '../utils/refresh'
import { triggerInternal } from '../utils/internal'

export default defineTask({
  meta: {
    name: 'metadata-sync',
    description: 'Trigger placed metadata sync via internal API',
  },
  async run() {
    await triggerInternal('metadata-sync', runMetadataSync)
    return { result: 'ok' }
  },
})
