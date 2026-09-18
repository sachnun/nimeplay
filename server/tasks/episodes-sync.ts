import { runEpisodesFill } from '../utils/refresh'
import { triggerInternal } from '../utils/internal'

export default defineTask({
  meta: {
    name: 'episodes-sync',
    description: 'Fill missing episodes from vendors',
  },
  async run() {
    await triggerInternal('episodes-sync', runEpisodesFill)
    return { result: 'ok' }
  },
})
