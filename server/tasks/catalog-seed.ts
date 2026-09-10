import { runCatalogSync } from '../utils/refresh'

export default defineTask({
  meta: {
    name: 'catalog:seed',
    description: 'First-time catalog seed: scrapes completed pages from every source before rolling ongoing pages',
  },
  async run() {
    const stats = await runCatalogSync('seed')
    return { result: stats }
  },
})
