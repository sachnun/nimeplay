import { mirrorMediaQueue, runFinishedSync, runFocusSync, runOngoingSync } from './refresh'

const MEDIA_TICK = 10

export async function runTick(): Promise<void> {
  await runFocusSync()
}

export async function runCatalog(): Promise<void> {
  await runOngoingSync()
  await runFinishedSync()
  await mirrorMediaQueue(MEDIA_TICK)
}
