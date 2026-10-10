import { describe, expect, test } from 'bun:test'
import { Effect, Layer } from 'effect'
import { Http } from '../net/http'
import { ylnime } from './ylnime'
import { otakudesu } from './otakudesu'
import { animein } from './animein'
import { nakanime } from './nakanime'
import { sokuja } from './sokuja'

const YLNIME_DETAIL_HTML = `<html><body>
<div class="col-md-9"><h1>Naruto</h1><span class="fw-bold fs-6">Ongoing</span>
<span class="fa-calendar-alt"></span>2024</div>
<div class="list-group">
  <a href="/index.php?series=naruto&episode=1">Naruto Episode 1 <span class="text-muted">2 hari lalu</span></a>
  <a href="/index.php?series=naruto&episode=2">Naruto Episode 2 <span class="text-muted">1 hari lalu</span></a>
</div></body></html>`

function mockHttp(handler: (url: string) => string) {
  return Layer.succeed(
    Http,
    Http.of({
      html: url => Effect.succeed(handler(url)),
      form: () => Effect.succeed({ data: 'eA==' }),
      formText: () => Effect.succeed(''),
      text: () => Effect.succeed({ status: 200, text: '{}', headers: {} }),
      binary: () => Effect.succeed(null),
    }),
  )
}

describe('source effect migration', () => {
  test('ylnime detail returns parsed episodes through the Http service', async () => {
    const detail = await Effect.runPromise(
      ylnime.detailFresh('naruto').pipe(Effect.provide(mockHttp(() => YLNIME_DETAIL_HTML))),
    )
    expect(detail?.title).toBe('Naruto')
    expect(detail?.status).toBe('Ongoing')
    expect(detail?.episodes.map(episode => episode.slug)).toEqual(['naruto@1', 'naruto@2'])
  })

  test('ylnime resolves a direct mirror without touching the network', async () => {
    const mirror = await Effect.runPromise(
      ylnime.resolveMirror('https://cdn.example/v.mp4').pipe(Effect.provide(mockHttp(() => ''))),
    )
    expect(mirror).toBe('https://cdn.example/v.mp4')
  })

  test('ylnime rejects a non http mirror', async () => {
    const mirror = await Effect.runPromise(
      ylnime.resolveMirror('not-a-url').pipe(Effect.provide(mockHttp(() => ''))),
    )
    expect(mirror).toBeNull()
  })

  test('ylnime list parses cards from the rendered page', async () => {
    const html = `<html><body><div class="card"><a href="/?series=bleach">Bleach</a></div></body></html>`
    const list = await Effect.runPromise(ylnime.ongoingFresh(1).pipe(Effect.provide(mockHttp(() => html))))
    expect(list.anime.map(card => card.slug)).toEqual(['bleach'])
  })

  test('otakudesu detail maps info fields into the scraped shape', async () => {
    const html = `<html><body><div class="jdlrx"><h1>One Piece</h1></div>
      <div class="infozingle"><p><span>Judul: One Piece</span></p><p><span>Status: Ongoing</span></p>
      <p><span>Japanese: ワンピース</span></p></div>
      <div class="episodelist"><ul><li><a href="/episode/one-piece-episode-1/">Episode 1</a><span class="zeebr">1 hari lalu</span></li></ul></div>
      </body></html>`
    const detail = await Effect.runPromise(
      otakudesu.detailFresh('one-piece').pipe(Effect.provide(mockHttp(() => html))),
    )
    expect(detail?.title).toBe('One Piece')
    expect(detail?.japanese).toBe('ワンピース')
    expect(detail?.status).toBe('Ongoing')
    expect(detail?.episodes.map(episode => episode.slug)).toEqual(['one-piece-episode-1'])
  })

  test('sokuja list derives cards and pagination', async () => {
    const html = `<html><body>
      <a class="group block" href="/anime/naruto/"></a>
      <a href="/anime/?status=ongoing&page=4"></a>
      </body></html>`
    const list = await Effect.runPromise(
      sokuja.ongoingFresh(1).pipe(Effect.provide(mockHttp(() => html))),
    )
    expect(list.anime.map(card => card.slug)).toEqual(['naruto'])
    expect(list.totalPages).toBe(4)
  })

  test('animein reads the api payload and maps finished movies', async () => {
    const http = Layer.succeed(
      Http,
      Http.of({
        html: () => Effect.succeed(''),
        form: () => Effect.succeed({}),
        formText: () => Effect.succeed(''),
        text: () =>
          Effect.succeed({
            status: 200,
            text: JSON.stringify({ status: 200, data: { movie: [{ id: '9', title: 'X', status: 'FINISHED' }] } }),
            headers: {},
          }),
        binary: () => Effect.succeed(null),
      }),
    )
    const list = await Effect.runPromise(animein.completedFresh(1).pipe(Effect.provide(http)))
    expect(list.anime.map(card => card.slug)).toEqual(['9'])
  })

  test('nakanime detail keeps only series episodes', async () => {
    const http = Layer.succeed(
      Http,
      Http.of({
        html: () => Effect.succeed(''),
        form: () => Effect.succeed({}),
        formText: () => Effect.succeed(''),
        text: () =>
          Effect.succeed({
            status: 200,
            text: JSON.stringify({
              data: {
                title: 'Naruto',
                slug: 'naruto',
                info: ['Status: Ongoing', 'Released: 2002'],
                episodes: [
                  { title: 'Naruto Episode 1', slug: 'naruto-episode-1' },
                  { title: 'Naruto Episode 2', slug: 'naruto-episode-2' },
                ],
              },
            }),
            headers: {},
          }),
        binary: () => Effect.succeed(null),
      }),
    )
    const detail = await Effect.runPromise(nakanime.detailFresh('naruto').pipe(Effect.provide(http)))
    expect(detail?.title).toBe('Naruto')
    expect(detail?.status).toBe('Ongoing')
    expect(detail?.episodes.map(episode => episode.slug)).toEqual(['naruto-episode-1', 'naruto-episode-2'])
  })

  test('every source exposes the effect based contract', () => {
    for (const source of [ylnime, otakudesu, animein, nakanime, sokuja]) {
      expect(typeof source.detailFresh).toBe('function')
      expect(typeof source.episodeFresh).toBe('function')
      expect(typeof source.resolveMirror).toBe('function')
    }
  })
})
