import { describe, expect, test } from 'bun:test'
import { Effect, Layer, Ref } from 'effect'
import { AniList, AniListTransport, aliasMediaQuery, aliasSearchQuery } from './anilist'

interface Call {
  query: string
  variables: Record<string, unknown>
}

function makeLayer(handler: (call: Call) => unknown) {
  const calls = Ref.makeUnsafe<Call[]>([])
  const transport = Layer.succeed(
    AniListTransport,
    AniListTransport.of({
      graphql: (query, variables) =>
        Ref.updateAndGet(calls, current => [...current, { query, variables }]).pipe(
          Effect.flatMap(() => Effect.sync(() => handler({ query, variables }) as unknown)),
        ),
    }),
  )
  return { layer: Layer.provideMerge(AniList.layer, transport), calls }
}

function aliased(values: unknown[], wrap: (value: unknown, index: number) => unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  values.forEach((value, index) => {
    out[`a${index}`] = wrap(value, index)
  })
  return out
}

const media = (idMal: number, romaji: string) => ({
  id: idMal * 10,
  idMal,
  format: 'TV',
  title: { romaji, english: romaji },
})

const searchHandler =
  (wrap: (value: unknown, index: number) => unknown = value => ({ media: [media(1, String(value))] })) =>
  ({ variables }: Call) =>
    aliased(Object.values(variables), wrap)

describe('AniList batching', () => {
  test('batches concurrent searches into a single GraphQL call', async () => {
    const { layer, calls } = makeLayer(searchHandler(value => ({ media: [media(1, `title-${String(value)}`)] })))

    const results = await Effect.runPromise(
      Effect.forEach(['naruto', 'bleach', 'onepiece', 'frieren'], q => Effect.flatMap(AniList, a => a.search(q)), {
        concurrency: 'unbounded',
      }).pipe(Effect.provide(layer)),
    )

    const recorded = await Effect.runPromise(Ref.get(calls))
    expect(recorded.length).toBe(1)
    expect(Object.keys(recorded[0]?.variables ?? {}).length).toBe(4)
    expect(results.map(r => r[0]?.title.romaji)).toEqual([
      'title-naruto',
      'title-bleach',
      'title-onepiece',
      'title-frieren',
    ])
  })

  test('deduplicates repeated searches and serves the second from cache', async () => {
    const { layer, calls } = makeLayer(searchHandler())

    await Effect.runPromise(
      Effect.forEach(['naruto', 'naruto', 'bleach', 'naruto'], q => Effect.flatMap(AniList, a => a.search(q)), {
        concurrency: 'unbounded',
      }).pipe(Effect.provide(layer)),
    )

    const recorded = await Effect.runPromise(Ref.get(calls))
    expect(recorded.length).toBe(1)
    expect(Object.values(recorded[0]?.variables ?? {}).map(String).toSorted()).toEqual(['bleach', 'naruto'])
  })

  test('normalizes the search key before caching', async () => {
    const { layer, calls } = makeLayer(searchHandler())

    await Effect.runPromise(
      Effect.forEach(['  NARUTO  ', 'naruto'], q => Effect.flatMap(AniList, a => a.search(q)), {
        concurrency: 'unbounded',
      }).pipe(Effect.provide(layer)),
    )

    const recorded = await Effect.runPromise(Ref.get(calls))
    expect(recorded.length).toBe(1)
    expect(Object.values(recorded[0]?.variables ?? {})).toEqual(['naruto'])
  })

  test('splits large batches at the alias limit', async () => {
    const { layer, calls } = makeLayer(searchHandler())

    const queries = Array.from({ length: 60 }, (_, index) => `q${index}`)
    await Effect.runPromise(
      Effect.forEach(queries, q => Effect.flatMap(AniList, a => a.search(q)), { concurrency: 'unbounded' }).pipe(
        Effect.provide(layer),
      ),
    )

    const recorded = await Effect.runPromise(Ref.get(calls))
    expect(recorded.length).toBe(3)
    expect(recorded.map(call => Object.keys(call.variables).length)).toEqual([25, 25, 10])
  })

  test('batches at the job concurrency used by the drain loop', async () => {
    const { layer, calls } = makeLayer(searchHandler(() => ({ media: [] })))
    await Effect.runPromise(
      Effect.gen(function* () {
        const api = yield* AniList
        yield* Effect.forEach(Array.from({ length: 40 }, (_, i) => `job-${i}`), q => api.search(q), {
          concurrency: 8,
          discard: true,
        })
      }).pipe(Effect.provide(layer)),
    )
    const recorded = await Effect.runPromise(Ref.get(calls))
    expect(recorded.length).toBeLessThan(40)
    expect(recorded.length).toBeGreaterThanOrEqual(5)
  })

  test('batches concurrent media lookups by mal id', async () => {
    const { layer, calls } = makeLayer(searchHandler(value => media(Number(value), `mal-${String(value)}`)))

    const results = await Effect.runPromise(
      Effect.forEach([20, 269, 21], id => Effect.flatMap(AniList, a => a.media(id)), {
        concurrency: 'unbounded',
      }).pipe(Effect.provide(layer)),
    )

    const recorded = await Effect.runPromise(Ref.get(calls))
    expect(recorded.length).toBe(1)
    expect(results.map(r => r?.title.romaji)).toEqual(['mal-20', 'mal-269', 'mal-21'])
  })

  test('splits media batches below the anilist complexity limit', async () => {
    const { layer, calls } = makeLayer(() => ({}))
    const ids = Array.from({ length: 25 }, (_, index) => index + 1)
    await Effect.runPromise(
      Effect.forEach(ids, id => Effect.flatMap(AniList, a => a.media(id)), {
        concurrency: 'unbounded',
        discard: true,
      }).pipe(Effect.provide(layer)),
    )
    const recorded = await Effect.runPromise(Ref.get(calls))
    const sizes = recorded.map(call => Object.keys(call.variables).length)
    // 25 media aliases cost 46 complexity each, so anilist rejects anything above 10.
    expect(Math.max(...sizes)).toBeLessThanOrEqual(10)
    expect(sizes.reduce((sum, n) => sum + n, 0)).toBe(25)
  })

  test('returns null media when the transport reports a miss', async () => {
    const { layer } = makeLayer(() => ({ a0: null }))
    const result = await Effect.runPromise(Effect.flatMap(AniList, a => a.media(999)).pipe(Effect.provide(layer)))
    expect(result).toBeNull()
  })

  test('falls back to an empty list when a search alias is missing', async () => {
    const { layer } = makeLayer(() => ({}))
    const result = await Effect.runPromise(Effect.flatMap(AniList, a => a.search('nothing')).pipe(Effect.provide(layer)))
    expect(result).toEqual([])
  })

  test('returns an empty list for a blank query without calling the transport', async () => {
    const { layer, calls } = makeLayer(() => ({}))
    const result = await Effect.runPromise(Effect.flatMap(AniList, a => a.search('   ')).pipe(Effect.provide(layer)))
    expect(result).toEqual([])
    expect((await Effect.runPromise(Ref.get(calls))).length).toBe(0)
  })

  test('fetches media by anilist id through the transport', async () => {
    const { layer } = makeLayer(() => ({ Media: media(20, 'NARUTO') }))
    const result = await Effect.runPromise(Effect.flatMap(AniList, a => a.mediaById(123)).pipe(Effect.provide(layer)))
    expect(result?.title.romaji).toBe('NARUTO')
  })

  test('caches a search result across sequential calls', async () => {
    const { layer, calls } = makeLayer(searchHandler())
    const results = await Effect.runPromise(
      Effect.gen(function* () {
        const api = yield* AniList
        const first = yield* api.search('naruto')
        const second = yield* api.search('naruto')
        return [first, second]
      }).pipe(Effect.provide(layer)),
    )
    expect(results[0]).toEqual(results[1])
    expect((await Effect.runPromise(Ref.get(calls))).length).toBe(1)
  })
})

describe('alias query builders', () => {
  test('declares one variable per alias', () => {
    const query = aliasSearchQuery(3)
    expect(query).toContain('$s0: String')
    expect(query).toContain('$s1: String')
    expect(query).toContain('$s2: String')
    expect(query).toContain('a0: Page')
    expect(query).toContain('a2: Page')
  })

  test('builds media aliases with mal id variables', () => {
    const query = aliasMediaQuery(2)
    expect(query).toContain('$m0: Int')
    expect(query).toContain('$m1: Int')
    expect(query).toContain('a1: Media(idMal: $m1')
  })
})
