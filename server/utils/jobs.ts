import { mirrorMediaQueue, runEpisodesFill, runFinishedSync, runMetadataSync, runOngoingSync } from './refresh'
import { sendJob, type JobKind } from './queue'

const METADATA_JOB_LIMIT = 200
const MEDIA_CONTINUE_DELAY_S = 5
const BACKFILL_CONTINUE_DELAY_S = 10

async function runOngoingJob(): Promise<void> {
  await runOngoingSync()
  await runEpisodesFill()
  await runMetadataSync({ limit: METADATA_JOB_LIMIT, scope: 'ongoing' })
  await sendJob('media')
}

async function runCompletedJob(): Promise<void> {
  const more = await runFinishedSync()
  await runMetadataSync({ limit: METADATA_JOB_LIMIT, scope: 'completed' })
  await runEpisodesFill()
  await sendJob('media')
  if (more) await sendJob('completed', BACKFILL_CONTINUE_DELAY_S)
}

async function runMediaJob(): Promise<void> {
  const { pending } = await mirrorMediaQueue()
  if (pending > 0) await sendJob('media', MEDIA_CONTINUE_DELAY_S)
}

export function runJob(kind: JobKind): Promise<void> {
  if (kind === 'ongoing') return runOngoingJob()
  if (kind === 'completed') return runCompletedJob()
  return runMediaJob()
}
