import { json } from '@sveltejs/kit'
import { openApiDocument } from '#lib/server/utils/openapi'
import type { RequestHandler } from './$types'

export const GET: RequestHandler = () => json(openApiDocument)
