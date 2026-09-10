export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    if (getRequestURL(event).pathname !== '/openapi.json') return
    const body = response.body as { paths?: Record<string, unknown> } | null | undefined
    if (!body || typeof body !== 'object' || !body.paths || typeof body.paths !== 'object') return
    for (const path of Object.keys(body.paths)) {
      if (!path.startsWith('/api/v1/')) delete body.paths[path]
    }
  })
})
