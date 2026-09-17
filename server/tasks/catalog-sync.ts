import { runCatalogSync } from '../utils/refresh'
import { triggerInternal } from '../utils/internal'

export default defineTask({
  meta: {
    name: 'catalog-sync',
    description: 'Trigger placed catalog sync via internal API',
  },
  async run() {
    await triggerInternal('catalog-sync', runCatalogSync)
    return { result: 'ok' }
  },
})
