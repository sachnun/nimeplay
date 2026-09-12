import { cache } from '../../utils/cache'
import { translateEnToId } from '../../utils/translate'

const TRANSLATE_TTL = 30 * 24 * 60 * 60 * 1000
const MAX_TEXT_LENGTH = 8000

interface TranslateRequestBody {
  malId?: number | null
  text?: string
}

function hashText(value: string): string {
  let hash = 5381
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0
  }
  return (hash >>> 0).toString(36)
}

export default defineEventHandler(async (event) => {
  const body = await readBody<TranslateRequestBody>(event)
  const text = body?.text?.trim() || ''
  if (!text) {
    throw createError({ statusCode: 400, statusMessage: 'Text is required' })
  }
  if (text.length > MAX_TEXT_LENGTH) {
    throw createError({ statusCode: 400, statusMessage: 'Text too long' })
  }

  const malId = body?.malId && Number.isInteger(body.malId) && body.malId > 0 ? body.malId : null
  const digest = `${hashText(text)}:${text.length}`
  const key = malId ? `mal:${malId}:${digest}` : `hash:${digest}`

  try {
    const translated = await cache.get('translate', key, TRANSLATE_TTL, () => translateEnToId(text), { event }) as string | null
    if (!translated) {
      throw createError({ statusCode: 502, statusMessage: 'Translation failed' })
    }
    return { text: translated }
  }
  catch (error) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    throw createError({ statusCode: 502, statusMessage: 'Translation failed' })
  }
})
