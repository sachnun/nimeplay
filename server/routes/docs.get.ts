import { defineEventHandler, serverFetch } from 'nuxt/server'

export default defineEventHandler(async event => {
  const response = await serverFetch(event, '/_swagger')
  const html = await response.text()
  return html.replace('layout2:', 'layout:').replaceAll('/_openapi.json', '/openapi.json')
})
