import { runCatalogSync } from '../utils/refresh'

export default defineTask({
  meta: {
    name: 'catalog-sync',
    description: 'Sync ongoing catalog from sources into D1',
  },
  async run() {
    await runCatalogSync()
    return { result: 'ok' }
  },
})
