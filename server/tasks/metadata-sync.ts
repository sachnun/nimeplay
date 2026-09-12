import { runMetadataSync } from '../utils/refresh'

export default defineTask({
  meta: {
    name: 'metadata-sync',
    description: 'Resolve MAL metadata backlog into D1',
  },
  async run() {
    await runMetadataSync()
    return { result: 'ok' }
  },
})
