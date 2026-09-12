const GOOGLE_URL = 'https://translate.googleapis.com/translate_a/single'
const MYMEMORY_URL = 'https://api.mymemory.translated.net/get'
const FETCH_TIMEOUT_MS = 8000
const MAX_CHUNK = 4000

function splitChunks(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text]
  const paragraphs = text.split(/\n{2,}/)
  const chunks: string[] = []
  let current = ''
  const pushCurrent = () => {
    if (current) chunks.push(current)
    current = ''
  }
  for (const para of paragraphs) {
    if ((current ? current.length + 2 : 0) + para.length <= MAX_CHUNK) {
      current = current ? `${current}\n\n${para}` : para
      continue
    }
    if (current) pushCurrent()
    if (para.length <= MAX_CHUNK) {
      current = para
      continue
    }
    const sentences = para.split(/(?<=[.!?])\s+/)
    for (const sentence of sentences) {
      if ((current ? current.length + 1 : 0) + sentence.length <= MAX_CHUNK) {
        current = current ? `${current} ${sentence}` : sentence
      }
      else {
        pushCurrent()
        if (sentence.length <= MAX_CHUNK) {
          current = sentence
        }
        else {
          for (let i = 0; i < sentence.length; i += MAX_CHUNK) {
            chunks.push(sentence.slice(i, i + MAX_CHUNK))
          }
        }
      }
    }
  }
  pushCurrent()
  return chunks.filter(Boolean)
}

async function translateGoogle(chunk: string): Promise<string | null> {
  try {
    const url = `${GOOGLE_URL}?client=gtx&sl=en&tl=id&dt=t&q=${encodeURIComponent(chunk)}`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data: unknown = await res.json()
    if (!Array.isArray(data) || !Array.isArray(data[0])) return null
    const joined = (data[0] as unknown[])
      .map((part) => Array.isArray(part) && typeof part[0] === 'string' ? part[0] as string : '')
      .join('')
      .trim()
    return joined || null
  }
  catch {
    return null
  }
}

async function translateMyMemory(chunk: string): Promise<string | null> {
  try {
    const url = `${MYMEMORY_URL}?q=${encodeURIComponent(chunk)}&langpair=en|id`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null
    const data = await res.json() as { responseData?: { translatedText?: string }, responseStatus?: number }
    const text = data?.responseData?.translatedText?.trim()
    if (!text) return null
    if (/^MYMEMORY WARNING/i.test(text)) return null
    if (/^QUERY LENGTH LIMIT/i.test(text)) return null
    if (text.toLowerCase() === chunk.toLowerCase()) return null
    return text
  }
  catch {
    return null
  }
}

export async function translateEnToId(text: string): Promise<string | null> {
  const source = text.trim()
  if (!source) return null
  const chunks = splitChunks(source)
  const out: string[] = []
  for (const chunk of chunks) {
    const google = await translateGoogle(chunk)
    if (google) {
      out.push(google)
      continue
    }
    const fallback = await translateMyMemory(chunk)
    if (fallback) {
      out.push(fallback)
      continue
    }
    return null
  }
  const joined = out.join('\n\n').trim()
  return joined || null
}
