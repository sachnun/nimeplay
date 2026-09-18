import { withPool } from '../utils/db'
import { runOngoing } from '../utils/jobs'

export default defineTask({
  meta: {
    name: 'ongoing',
    description: 'Sync ongoing catalog and resolve ongoing metadata',
  },
  async run() {
    await withPool(() => runOngoing())
    return { result: 'ok' }
  },
})
