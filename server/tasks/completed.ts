import { sendJob } from '../utils/jobs'

export default defineTask({
  meta: {
    name: 'completed',
    description: 'Enqueue the completed sync job',
  },
  async run() {
    await sendJob('completed')
    return { result: 'ok' }
  },
})
