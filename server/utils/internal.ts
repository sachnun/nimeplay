import type { H3Event } from 'h3'
import { createError, getHeader } from 'h3'

export const INTERNAL_KEY = 'nimeplay'

export function assertInternal(event: H3Event): void {
  if (getHeader(event, 'x-nimeplay-key') !== INTERNAL_KEY) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
}
