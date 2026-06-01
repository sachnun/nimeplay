import type { H3Event } from 'h3'
import { setHeader } from 'h3'

const API_CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, TRPC-Accept, X-TRPC-Source',
  'Access-Control-Max-Age': '86400',
}

export function setApiCorsHeaders(event: H3Event) {
  for (const [name, value] of Object.entries(API_CORS_HEADERS)) setHeader(event, name, value)
}

export function apiCorsPreflightResponse() {
  return new Response(null, { status: 204, headers: API_CORS_HEADERS })
}


