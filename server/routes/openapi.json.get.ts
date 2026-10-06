import { defineEventHandler, serverFetch } from 'nuxt/server'

interface OpenApiDocument {
  paths?: Record<string, unknown>
  servers?: unknown[]
}

export default defineEventHandler(async event => {
  const response = await serverFetch(event, '/_openapi.json')
  const body = (await response.json()) as OpenApiDocument
  delete body.servers
  if (body.paths && typeof body.paths === 'object') {
    for (const path of Object.keys(body.paths)) {
      if (!path.startsWith('/api/v1/')) delete body.paths[path]
    }
  }
  return body
})
