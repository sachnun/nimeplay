import { ORPCError, os, type } from '@orpc/server'
import { listAnimePage } from '../utils/db/queries/catalog'
import { getAnimeDetail } from '../utils/db/queries/detail'
import { getEpisodeNumbers, resolveEpisode } from '../utils/db/queries/episodes'
import { getGenreAnimePage, getGenreList } from '../utils/db/queries/genres'
import { searchAnime } from '../utils/db/queries/search'
import { loadEpisodeData } from '../utils/db/episode-cache'
import { emptyPrepareResult, prepareMirror } from '../utils/media/prepare'

export interface RouterContext {
  origin: string
}

const o = os.$context<RouterContext>()

export const router = {
  catalog: {
    home: o.handler(async () => {
      const [ongoingData, completedData, genres] = await Promise.all([
        listAnimePage('ONGOING', 1),
        listAnimePage('COMPLETED', 1),
        getGenreList(),
      ])
      return { ongoingData, completedData, genres }
    }),
    list: o
      .input(type<{ type?: 'ONGOING' | 'COMPLETED', page?: number }>())
      .handler(({ input }) => {
        const status = input.type === 'COMPLETED' ? 'COMPLETED' : 'ONGOING'
        const page = Math.max(1, Number(input.page) || 1)
        return listAnimePage(status, page)
      }),
    genres: o.handler(() => getGenreList()),
    genre: o
      .input(type<{ slug: string, page?: number }>())
      .handler(async ({ input }) => {
        const page = Math.max(1, Number(input.page) || 1)
        const result = await getGenreAnimePage(input.slug, page)
        if (!result) throw new ORPCError('NOT_FOUND', { message: 'Genre not found' })
        return result
      }),
    search: o
      .input(type<{ query: string }>())
      .handler(({ input }) => {
        const query = input.query.trim()
        return query ? searchAnime(query) : []
      }),
  },
  anime: {
    detail: o
      .input(type<{ malId: number }>())
      .handler(async ({ input }) => {
        const detail = await getAnimeDetail(input.malId)
        if (!detail) throw new ORPCError('NOT_FOUND', { message: 'Anime not found' })
        return detail
      }),
    episode: o
      .input(type<{ malId: number, episode: number }>())
      .handler(async ({ input }) => {
        const resolved = await resolveEpisode(input.malId, input.episode)
        if (!resolved) throw new ORPCError('NOT_FOUND', { message: 'Episode not found' })

        const [scraped, episodeNumbers] = await Promise.all([
          loadEpisodeData(resolved.candidates.map(candidate => candidate.episodeSlug)),
          getEpisodeNumbers(resolved.animeId),
        ])
        if (!scraped) throw new ORPCError('NOT_FOUND', { message: 'Episode unavailable' })

        return {
          anime: { malId: input.malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
          episodeNumber: input.episode,
          episode: {
            title: `${resolved.anime.title} Episode ${input.episode}`,
            mirrors: scraped.mirrors,
            thumbnail: scraped.thumbnail || resolved.anime.thumbnail,
          },
          episodes: episodeNumbers,
        }
      }),
    episodeMeta: o
      .input(type<{ malId: number, episode: number }>())
      .handler(async ({ input }) => {
        const resolved = await resolveEpisode(input.malId, input.episode)
        if (!resolved) throw new ORPCError('NOT_FOUND', { message: 'Episode not found' })

        const episodes = await getEpisodeNumbers(resolved.animeId)
        return {
          anime: { malId: input.malId, title: resolved.anime.title, thumbnail: resolved.anime.thumbnail },
          episodeNumber: input.episode,
          episodeTitle: `${resolved.anime.title} Episode ${input.episode}`,
          episodes,
        }
      }),
  },
  mirror: {
    prepare: o
      .input(type<{ dataContent: string }>())
      .handler(({ input, context }) => {
        if (!input.dataContent) return emptyPrepareResult()
        return prepareMirror(input.dataContent, context.origin)
      }),
  },
}

export type AppRouter = typeof router
