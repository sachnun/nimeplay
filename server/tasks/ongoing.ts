import { sendJob } from '../utils/jobs'

export default defineTask({
  meta: {
    name: 'ongoing',
    description: 'Enqueue the ongoing sync job',
  },
  async run() {
    await sendJob('ongoing')
    return { result: 'ok' }
  },
})
