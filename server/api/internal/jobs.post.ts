import { assertInternal } from '../../utils/internal'
import { sendJob, type JobKind } from '../../utils/jobs'

const KINDS: JobKind[] = ['ongoing', 'completed', 'media']

export default defineEventHandler(async (event) => {
  assertInternal(event)
  const body = await readBody<{ kind?: JobKind }>(event).catch(() => null)
  const kind = body?.kind && KINDS.includes(body.kind) ? body.kind : 'ongoing'
  await sendJob(kind)
  return { queued: kind }
})
