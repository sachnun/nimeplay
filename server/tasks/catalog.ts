import { withPool } from '../utils/db'
import { runCatalog } from '../utils/jobs'

export default defineTask({
  meta: {
    name: 'catalog',
    description: 'Seed ongoing and completed catalog entries',
  },
  async run() {
    await withPool(() => runCatalog())
    return { result: 'ok' }
  },
})
