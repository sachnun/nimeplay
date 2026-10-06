import { createError, defineEventHandler } from 'nuxt/server'

export default defineEventHandler(() => {
  throw createError({ status: 404, statusText: 'Not Found' })
})
