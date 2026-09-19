import { runFinishedSync, runFocusSync, runOngoingSync } from './refresh'

export async function runTick(): Promise<void> {
  while (await runFocusSync()) {
    // drain the focus backlog
  }
}

export async function runCatalog(): Promise<void> {
  await runOngoingSync()
  await runFinishedSync()
}
