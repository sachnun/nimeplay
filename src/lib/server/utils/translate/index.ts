import { Data, Duration, Effect, Schedule } from 'effect'
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

type ResolvedOptions = Required<Omit<TranslateOptions, 'onProgress'>> & Pick<TranslateOptions, 'onProgress'>

class TranslateFailure extends Data.TaggedError('TranslateFailure')<{ readonly reason: string }> {}

function resolveOptions(options: TranslateOptions): ResolvedOptions {
  return {
    to: options.to ?? DEFAULT_TARGET,
    from: options.from ?? DEFAULT_SOURCE,
    chunkSize: options.chunkSize ?? DEFAULT_CHUNK_SIZE,
    concurrency: options.concurrency ?? DEFAULT_CONCURRENCY,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    baseDelayMs: options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    onProgress: options.onProgress,
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

function retryPolicy(options: ResolvedOptions): Schedule.Schedule<Duration.Duration, TranslateFailure> {
  return Schedule.exponential(Duration.millis(options.baseDelayMs), 2).pipe(
    Schedule.setInputType<TranslateFailure>(),
    Schedule.modifyDelay(({ duration }) =>
      Effect.succeed(Duration.millis(Duration.toMillis(duration) * (0.5 + Math.random()))),
    ),
    Schedule.upTo({ times: Math.max(0, options.maxRetries - 1) }),
  )
}

function translateChunkWithRetry(texts: string[], options: ResolvedOptions): Effect.Effect<(string | null)[]> {
  if (options.maxRetries <= 0) return Effect.succeed(texts.map(() => null))
  return Effect.tryPromise({
    try: () => translateChunk(texts, options),
    catch: error => new TranslateFailure({ reason: error instanceof Error ? error.message : String(error) }),
  }).pipe(
    Effect.retry(retryPolicy(options)),
    Effect.orElseSucceed(() => texts.map(() => null)),
  )
}

export async function translateMany(texts: string[], options: TranslateOptions = {}): Promise<(string | null)[]> {
  const resolved = resolveOptions(options)
  const chunks: string[][] = []
  for (let i = 0; i < texts.length; i += resolved.chunkSize) {
    chunks.push(texts.slice(i, i + resolved.chunkSize))
  }

  let completed = 0
  const results = await Effect.runPromise(
    Effect.forEach(
      chunks,
      chunk =>
        translateChunkWithRetry(chunk, resolved).pipe(
          Effect.tap(() =>
            Effect.sync(() => {
              options.onProgress?.(++completed, chunks.length)
            }),
          ),
        ),
      { concurrency: Math.max(1, resolved.concurrency) },
    ),
  )
  return results.flat()
}

export async function translateText(text: string, options: TranslateOptions = {}): Promise<string | null> {
  const value = text.trim()
  if (!value) return null
  const [translated] = await translateMany([value], { ...options, chunkSize: 1 })
  return translated ?? null
}
