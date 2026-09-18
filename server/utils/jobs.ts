import { mirrorMediaQueue, pendingMediaCount, runEpisodesFill, runFinishedSync, runMetadataSync, runOngoingSync } from './refresh'

const MEDIA_DRAIN = 22
const MEDIA_TICK = 10
const METADATA_TICK_LIMIT = 3
const ONGOING_METADATA_LIMIT = 6
const MEDIA_BACKPRESSURE = 800

export async function runTick(): Promise<void> {
  const pending = await pendingMediaCount()
  if (pending > MEDIA_BACKPRESSURE) {
    await mirrorMediaQueue(MEDIA_DRAIN)
    return
  }
  await mirrorMediaQueue(MEDIA_TICK)
  await runMetadataSync({ limit: METADATA_TICK_LIMIT, scope: 'completed' })
  await runEpisodesFill()
}

export async function runOngoing(): Promise<void> {
  await runOngoingSync()
  await runMetadataSync({ limit: ONGOING_METADATA_LIMIT, scope: 'ongoing' })
  await mirrorMediaQueue(MEDIA_TICK)
}

export async function runCompleted(): Promise<void> {
  await runFinishedSync()
  await mirrorMediaQueue(MEDIA_TICK)
}
