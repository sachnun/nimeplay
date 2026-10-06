import { Data, Duration, Effect, Schedule } from 'effect'
import { plainGetBinary } from '../net/fetch'
import { getSpoofHeaders } from '../net/spoof'
import { optimizeImage } from './image'
import { putMedia } from './index'

const MAL_REFERER = 'https://myanimelist.net/'
const FETCH_TIMEOUT_MS = 15000
const FETCH_ATTEMPTS = 3
const RETRY_BASE_MS = 500
const POSTER_WIDTH = 256
const AVATAR_SIZE = 112

class HttpError extends Data.TaggedError('HttpError')<{ readonly status: number }> {}
class FetchFailure extends Data.TaggedError('FetchFailure')<{ readonly reason: string }> {}

type MediaFetchError = HttpError | FetchFailure

interface RemoteMedia {
  contentType: string
  bytes: ArrayBuffer
}

function isPermanent(error: MediaFetchError): boolean {
  return error instanceof HttpError && error.status >= 400 && error.status < 500
}

const retryPolicy = Schedule.exponential(Duration.millis(RETRY_BASE_MS), 2).pipe(
  Schedule.upTo({ times: FETCH_ATTEMPTS - 1 }),
)

function fetchImage(url: string): Effect.Effect<RemoteMedia, MediaFetchError> {
  return Effect.gen(function* () {
    const direct = yield* Effect.promise(() =>
      plainGetBinary(url, { headers: { referer: MAL_REFERER }, timeoutMs: FETCH_TIMEOUT_MS }),
    )
    if (direct && direct.status >= 200 && direct.status < 300) {
      return { contentType: direct.contentType, bytes: direct.bytes.buffer as ArrayBuffer }
    }
    const response = yield* Effect.tryPromise({
      try: () =>
        fetch(url, {
          headers: getSpoofHeaders(MAL_REFERER, 'cors'),
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        }),
      catch: error => new FetchFailure({ reason: error instanceof Error ? error.message : String(error) }),
    })
    if (!response.ok) return yield* Effect.fail(new HttpError({ status: response.status }))
    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    const bytes = yield* Effect.tryPromise({
      try: () => response.arrayBuffer(),
      catch: error => new FetchFailure({ reason: error instanceof Error ? error.message : String(error) }),
    })
    return { contentType, bytes }
  })
}

export async function storeMedia(key: string, data: ArrayBuffer, contentType: string): Promise<void> {
  const poster = key.startsWith('posters/')
  const encoded = await optimizeImage(data, contentType, poster ? POSTER_WIDTH : AVATAR_SIZE)
  await putMedia(key, encoded.bytes, encoded.contentType)
}

export async function fetchRemoteMedia(url: string): Promise<RemoteMedia> {
  return Effect.runPromise(
    fetchImage(url).pipe(
      Effect.retry({ while: error => !isPermanent(error), schedule: retryPolicy }),
    ),
  )
}
