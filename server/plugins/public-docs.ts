export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('beforeResponse', (event, response) => {
    const pathname = getRequestURL(event).pathname
    if (pathname === '/docs') {
      if (typeof response.body === 'string') response.body = response.body.replace('layout2:', 'layout:')
      return
    }
    if (pathname !== '/openapi.json') return
    const body = response.body as { paths?: Record<string, unknown>, servers?: unknown[] } | null | undefined
    if (!body || typeof body !== 'object' || !body.paths || typeof body.paths !== 'object') return
    delete body.servers
    for (const path of Object.keys(body.paths)) {
      if (!path.startsWith('/api/v1/')) delete body.paths[path]
    }
  })
})
