import { runMetadataFill } from '../utils/refresh'
import { triggerInternal } from '../utils/internal'

export default defineTask({
  meta: {
    name: 'metadata-sync',
    description: 'Resolve AniList metadata and mirror queued media',
  },
  async run() {
    await triggerInternal('metadata-sync', runMetadataFill)
    return { result: 'ok' }
  },
})
