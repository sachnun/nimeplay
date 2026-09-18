import { withPool } from '../utils/db'
import { runTick } from '../utils/jobs'

export default defineTask({
  meta: {
    name: 'tick',
    description: 'Metadata, episodes, and media pipeline tick',
  },
  async run() {
    await withPool(() => runTick())
    return { result: 'ok' }
  },
})
