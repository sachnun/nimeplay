import type { MetadataRequestBody } from '../../utils/metadata'
import { resolveMetadata } from '../../utils/metadata'

export default defineEventHandler(async (event) => {
  const body = await readBody<MetadataRequestBody>(event)
  return resolveMetadata(body ?? {})
})
