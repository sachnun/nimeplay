import { Effect, pipe } from 'effect'
import { getSpoofHeaders } from '../spoof'
import { isVidhide, extractVidhide } from './vidhide'
import { isDesuStreamHd, extractDesuStream } from './desustream'
import { isDesuDrive, extractDesuDrive } from './desudrive'
import { isFiledon, extractFiledon } from './filedon'

type HostExtractor = {
  matches: (url: string) => boolean
  extract: (url: string, html: string) => Promise<string | null> | string | null
}

const HOST_EXTRACTORS: HostExtractor[] = [
  { matches: isVidhide, extract: extractVidhide },
  { matches: isDesuStreamHd, extract: extractDesuStream },
  { matches: isDesuDrive, extract: extractDesuDrive },
  { matches: isFiledon, extract: extractFiledon },
]

function fetchIframeHtmlEffect(iframeUrl: string) {
  return pipe(
    Effect.tryPromise({
      try: () =>
        fetch(iframeUrl, {
          headers: getSpoofHeaders(iframeUrl, 'iframe'),
          signal: AbortSignal.timeout(8000),
        }).then((r) => r.text()),
      catch: () => null,
    }),
    Effect.catchAll(() => Effect.succeed('')),
  )
}

function extractKnownHost(iframeUrl: string, html: string) {
  const extractor = HOST_EXTRACTORS.find((c) => c.matches(iframeUrl))
  return extractor
    ? pipe(
        Effect.tryPromise({ try: () => extractor.extract(iframeUrl, html) as Promise<string | null>, catch: () => null }),
        Effect.catchAll(() => Effect.succeed(null)),
      )
    : Effect.succeed<string | null>(null)
}

function extractFallbackHost(iframeUrl: string, html: string) {
  const mp4Match = html.match(/<source\s+src="([^"]*googlevideo[^"]*)"/)

  const effects = [
    pipe(
      Effect.tryPromise({ try: () => extractVidhide(iframeUrl, html), catch: () => null }),
      Effect.catchAll(() => Effect.succeed(null)),
    ),
    ...(mp4Match?.[1] ? [Effect.succeed<string | null>(mp4Match[1])] : []),
    pipe(
      Effect.tryPromise({ try: () => extractDesuDrive(iframeUrl, html), catch: () => null }),
      Effect.catchAll(() => Effect.succeed(null)),
    ),
  ]

  return Effect.firstSuccessOf(effects)
}

export function probeIframeUrl(iframeUrl: string): Promise<boolean> {
  return Effect.runPromise(
    pipe(
      fetchIframeHtmlEffect(iframeUrl),
      Effect.map((body) => body.length > 100),
      Effect.catchAll(() => Effect.succeed(false)),
    ),
  )
}

export function extractStreamUrl(iframeUrl: string): Promise<{ proxiedUrl: string | null; iframeUrl: string }> {
  return Effect.runPromise(
    pipe(
      fetchIframeHtmlEffect(iframeUrl),
      Effect.flatMap((html) =>
        Effect.firstSuccessOf([
          extractKnownHost(iframeUrl, html),
          extractFallbackHost(iframeUrl, html),
        ]),
      ),
      Effect.map((proxiedUrl) => ({ proxiedUrl, iframeUrl })),
      Effect.catchAll(() => Effect.succeed({ proxiedUrl: null, iframeUrl })),
    ),
  )
}