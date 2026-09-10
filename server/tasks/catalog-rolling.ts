import { runCatalogSync } from '../utils/refresh'

export default defineTask({
  meta: {
    name: 'catalog:rolling',
    description: 'Rolling ongoing catalog sync: registers ongoing cards, refreshes new episodes and resolves pending metadata',
  },
  async run() {
    const stats = await runCatalogSync('rolling')
    return { result: stats }
  },
})
