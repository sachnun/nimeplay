import translate from 'google-translate-api-x'

const DEFAULT_CHUNK_SIZE = 40
const DEFAULT_CONCURRENCY = 3
const DEFAULT_MAX_RETRIES = 6
const DEFAULT_BASE_DELAY_MS = 700
const DEFAULT_TARGET = 'id'
const DEFAULT_SOURCE = 'auto'

export interface TranslateOptions {
  to?: string
  from?: string
  chunkSize?: number
  concurrency?: number
  maxRetries?: number
  baseDelayMs?: number
  onProgress?: (done: number, total: number) => void
}

type ResolvedOptions = Required<TranslateOptions>

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function resolveOptions(options: TranslateOptions): ResolvedOptions {
  return {
    to: options.to ?? DEFAULT_TARGET,
    from: options.from ?? DEFAULT_SOURCE,
    chunkSize: options.chunkSize ?? DEFAULT_CHUNK_SIZE,
    concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    baseDelayMs: options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
  }
}

async function translateChunk(texts: string[], options: ResolvedOptions): Promise<(string | null)[]> {
  const result = await translate(texts, {
    to: options.to,
    from: options.from,
    rejectOnPartialFail: false,
  })
  const list = Array.isArray(result) ? result : [result]
  return list.map(item => {
    const value = (item as { text?: string }).text
    return typeof value === 'string' && value.length > 0 ? value : null
  })
}

async function translateChunkWithRetry(texts: string[], options: ResolvedOptions): Promise<(string | null)[]> {
  for (let attempt = 1; attempt <= options.maxRetries; attempt++) {
    try {
      return await translateChunk(texts, options)
    } catch {
      if (attempt === options.maxRetries) break
      await sleep(Math.round(options.baseDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random())))
    }
  }
  return texts.map(() => null)
}

export async function translateMany(texts: string[], options: TranslateOptions = {}): Promise<(string | null)[]> {
  const resolved = resolveOptions(options)
  const chunks: string[][] = []
  for (let i = 0; i < texts.length; i += resolved.chunkSize) {
    chunks.push(texts.slice(i, i + resolved.chunkSize))
  }

  const results = Array.from<(string | null)[]>({ length: chunks.length })
  let next = 0
  let completed = 0
  const workers = Array.from({ length: Math.min(resolved.concurrency, chunks.length) }, async () => {
    while (true) {
      const index = next++
      if (index >= chunks.length) return
      results[index] = await translateChunkWithRetry(chunks[index]!, resolved)
      options.onProgress?.(++completed, chunks.length)
    }
  })
  await Promise.all(workers)
  return results.flat()
}

export async function translateText(text: string, options: TranslateOptions = {}): Promise<string | null> {
  const value = text.trim()
  if (!value) return null
  const [translated] = await translateMany([value], { ...options, chunkSize: 1 })
  return translated ?? null
}
