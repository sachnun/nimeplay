import { Cache, Context, Duration, Effect, Exit, Layer, Request, RequestResolver } from 'effect'
import { ManagedRuntime } from 'effect'
import { proxyFetch } from '../media/proxy'
import { runGuarded, retryAfterMs } from '../net/rate'

const ANILIST_URL = 'https://graphql.anilist.co'
const FETCH_TIMEOUT_MS = 20000
const CACHE_CAPACITY = 10_000
const SEARCH_TTL = Duration.hours(6)
const MEDIA_TTL = Duration.hours(24)
const BATCH_DELAY = '15 millis'
const MAX_ALIASES = 25

export interface TitleNames {
  romaji?: string | null
  english?: string | null
  native?: string | null
}

export interface AniListSearchMedia {
  id: number
  idMal: number | null
  format?: string | null
  averageScore?: number | null
  popularity?: number | null
  season?: string | null
  seasonYear?: number | null
  startDate?: { year?: number | null } | null
  genres?: string[] | null
  synonyms?: string[] | null
  coverImage?: { extraLarge?: string | null; large?: string | null } | null
  title: TitleNames
}

export interface AniListMedia {
  id: number
  idMal: number | null
  status?: string | null
  format?: string | null
  title: TitleNames
  coverImage?: { extraLarge?: string | null; large?: string | null } | null
  description?: string | null
  averageScore?: number | null
  rankings?: { rank: number; type: string }[] | null
  popularity?: number | null
  season?: string | null
  seasonYear?: number | null
  startDate?: { year?: number | null } | null
  trailer?: { id?: string | null; site?: string | null } | null
  studios?: { nodes?: { name: string }[] } | null
  genres?: string[] | null
  episodes?: number | null
  nextAiringEpisode?: { airingAt?: number | null; episode?: number | null } | null
  characters?: {
    edges?: {
      role?: string | null
      node?: { name?: { full?: string | null } | null; image?: { large?: string | null } | null } | null
      voiceActors?: { name?: { full?: string | null } | null; image?: { large?: string | null } | null }[] | null
    }[]
  } | null
}

export class AniListTransport extends Context.Service<
  AniListTransport,
  {
    readonly graphql: (query: string, variables: Record<string, unknown>) => Effect.Effect<unknown>
  }
>()('app/AniListTransport') {}

export const AniListTransportLive = Layer.succeed(
  AniListTransport,
  AniListTransport.of({
    graphql: (query, variables) =>
      Effect.gen(function* () {
        const result = yield* Effect.result(
          runGuarded({
            url: ANILIST_URL,
            task: signal =>
              proxyFetch(ANILIST_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ query, variables }),
                signal,
              }),
            timeoutMs: FETCH_TIMEOUT_MS,
            status: response => (response.status === 429 || response.status >= 500 ? response.status : null),
            retryAfter: retryAfterMs,
          }),
        )
        if (result._tag === 'Failure') {
          yield* Effect.logWarning('[anilist] request failed', {
            error: result.failure.message,
            status: result.failure.status,
          })
          return null
        }
        if (!result.success.ok) {
          yield* Effect.logWarning(`[anilist] ${result.success.status} ${result.success.statusText}`)
          return null
        }
        return yield* Effect.tryPromise({
          try: async () => {
            const body = (await result.success.json()) as { data?: unknown }
            return body.data ?? null
          },
          catch: error => error,
        }).pipe(
          Effect.catch(error =>
            Effect.logWarning('[anilist] invalid response', {
              error: error instanceof Error ? error.message : String(error),
            }).pipe(Effect.as(null)),
          ),
        )
      }),
  }),
)

const ALIAS_MEDIA_FIELDS = `
  id
  idMal
  status
  format
  title { romaji english native }
  coverImage { extraLarge large }
  description(asHtml: false)
  averageScore
  rankings { rank type }
  popularity
  season
  seasonYear
  startDate { year }
  trailer { id site }
  studios(isMain: true) { nodes { name } }
  genres
  episodes
  nextAiringEpisode { airingAt episode }
  characters(perPage: 25, sort: [ROLE, RELEVANCE]) {
    edges {
      role
      node { name { full } image { large } }
      voiceActors(language: JAPANESE) { name { full } image { large } }
    }
  }`

const SEARCH_FIELDS = `id idMal format averageScore popularity season seasonYear startDate { year } genres synonyms coverImage { extraLarge large } title { romaji english native }`

export function aliasSearchQuery(count: number): string {
  const fields = Array.from(
    { length: count },
    (_, index) => `  a${index}: Page(perPage: 15) { media(search: $s${index}, type: ANIME) { ${SEARCH_FIELDS} } }`,
  ).join('\n')
  const variables = Array.from({ length: count }, (_, index) => `$s${index}: String`).join(', ')
  return `query (${variables}) {\n${fields}\n}`
}

export function aliasMediaQuery(count: number): string {
  const fields = Array.from(
    { length: count },
    (_, index) => `  a${index}: Media(idMal: $m${index}, type: ANIME) {${ALIAS_MEDIA_FIELDS}\n  }`,
  ).join('\n')
  const variables = Array.from({ length: count }, (_, index) => `$m${index}: Int`).join(', ')
  return `query (${variables}) {\n${fields}\n}`
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size))
  return out
}

class AniListSearchRequest extends Request.Class<{ readonly search: string }, AniListSearchMedia[], never, never> {}
class AniListMediaRequest extends Request.Class<{ readonly idMal: number }, AniListMedia | null, never, never> {}

export interface AniListShape {
  readonly search: (query: string) => Effect.Effect<AniListSearchMedia[]>
  readonly media: (idMal: number) => Effect.Effect<AniListMedia | null>
  readonly mediaById: (id: number) => Effect.Effect<AniListMedia | null>
}

export class AniList extends Context.Service<AniList, AniListShape>()('app/AniList') {
  static readonly layer: Layer.Layer<AniList, never, AniListTransport> = Layer.effect(
    AniList,
    Effect.gen(function* () {
      const transport = yield* AniListTransport

      const searchResolver = RequestResolver.make<AniListSearchRequest>(
        Effect.fnUntraced(function* (entries) {
          for (const group of chunk([...entries], MAX_ALIASES)) {
            const variables: Record<string, string> = {}
            group.forEach((entry, index) => {
              variables[`s${index}`] = entry.request.search
            })
            const data = (yield* transport.graphql(aliasSearchQuery(group.length), variables)) as Record<
              string,
              { media?: AniListSearchMedia[] }
            > | null
            group.forEach((entry, index) => {
              entry.completeUnsafe(Exit.succeed(data?.[`a${index}`]?.media ?? []))
            })
          }
        }),
      ).pipe(RequestResolver.setDelay(BATCH_DELAY))

      const mediaResolver = RequestResolver.make<AniListMediaRequest>(
        Effect.fnUntraced(function* (entries) {
          for (const group of chunk([...entries], MAX_ALIASES)) {
            const variables: Record<string, number> = {}
            group.forEach((entry, index) => {
              variables[`m${index}`] = entry.request.idMal
            })
            const data = (yield* transport.graphql(aliasMediaQuery(group.length), variables)) as Record<
              string,
              AniListMedia | null
            > | null
            group.forEach((entry, index) => {
              entry.completeUnsafe(Exit.succeed(data?.[`a${index}`] ?? null))
            })
          }
        }),
      ).pipe(RequestResolver.setDelay(BATCH_DELAY))

      const searchCache = yield* Cache.make<string, AniListSearchMedia[]>({
        capacity: CACHE_CAPACITY,
        lookup: key => Effect.request(new AniListSearchRequest({ search: key }), searchResolver),
        timeToLive: SEARCH_TTL,
      })

      const mediaCache = yield* Cache.make<number, AniListMedia | null>({
        capacity: CACHE_CAPACITY,
        lookup: idMal => Effect.request(new AniListMediaRequest({ idMal }), mediaResolver),
        timeToLive: MEDIA_TTL,
      })

      const search = (query: string) => {
        const key = query.trim().toLowerCase()
        return key ? Cache.get(searchCache, key) : Effect.succeed<AniListSearchMedia[]>([])
      }

      const media = (idMal: number) => Cache.get(mediaCache, idMal)

      const mediaById = (id: number) =>
        transport
          .graphql(`query ($id: Int) {\n  Media(id: $id, type: ANIME) {${ALIAS_MEDIA_FIELDS}\n  }\n}`, { id })
          .pipe(Effect.map(data => (data as { Media?: AniListMedia } | null)?.Media ?? null))

      return AniList.of({ search, media, mediaById })
    }),
  )

  static readonly live: Layer.Layer<AniList> = Layer.provide(AniList.layer, AniListTransportLive)
}

const anilistRuntime = ManagedRuntime.make(AniList.live)

export function runAniList<A>(effect: Effect.Effect<A, never, AniList>): Promise<A> {
  return anilistRuntime.runPromise(effect)
}
