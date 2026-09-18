import { withPool } from '../utils/db'
import { runCompleted } from '../utils/jobs'

export default defineTask({
  meta: {
    name: 'completed',
    description: 'Backfill completed catalog',
  },
  async run() {
    await withPool(() => runCompleted())
    return { result: 'ok' }
  },
})
