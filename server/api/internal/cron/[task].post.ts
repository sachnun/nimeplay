import type { H3Event } from 'h3'
import { runCatalogSync, runMediaSync, runMetadataSync } from '../../../utils/refresh'
import { withPool } from '../../../utils/db'
import { assertInternal } from '../../../utils/internal'

const TASKS = {
  'catalog-sync': runCatalogSync,
  'metadata-sync': runMetadataSync,
  'media-sync': runMediaSync,
} as const

export default defineEventHandler((event) => {
  assertInternal(event)

  const task = getRouterParam(event, 'task') as keyof typeof TASKS | undefined
  const run = task ? TASKS[task] : undefined
  if (!run) throw createError({ statusCode: 404, statusMessage: 'Unknown task' })

  const done = withPool(run).catch(() => {})
  const waitUntil = (event as H3Event & { waitUntil?: (p: Promise<unknown>) => void }).waitUntil
  if (waitUntil) waitUntil(done)
  else done.catch(() => {})

  setHeader(event, 'cache-control', 'no-store')
  setResponseStatus(event, 202)
  return { task, accepted: true }
})
