import { runMetadataFill } from '../utils/refresh'
import { triggerInternal } from '../utils/internal'

export default defineTask({
  meta: {
    name: 'metadata-sync',
    description: 'Resolve AniList metadata for pending anime',
  },
  async run() {
    await triggerInternal('metadata-sync', runMetadataFill)
    return { result: 'ok' }
  },
})
