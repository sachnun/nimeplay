import { defineRouteMeta } from 'nitro'
import { createError, defineEventHandler, getRouterParam } from 'nuxt/server'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'Get anime detail',
    description: 'Anime detail with episode list, keyed by MyAnimeList ID.',
    parameters: [
      {
        name: 'malId',
        in: 'path',
        required: true,
        schema: { type: 'integer' },
        description: 'MyAnimeList ID',
        example: 52991,
      },
    ],
    responses: {
      '200': {
        description: 'Anime detail',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AnimeDetail' },
            example: {
              malId: 52991,
              title: 'Sousou no Frieren',
              japanese: '',
              score: '9.3',
              producer: '',
              type: 'TV',
              status: 'Ongoing',
              totalEpisode: '28',
              duration: '',
              releaseDate: '',
              studio: 'Madhouse',
              genres: [
                { name: 'Adventure', slug: 'adventure' },
                { name: 'Drama', slug: 'drama' },
                { name: 'Fantasy', slug: 'fantasy' },
              ],
              thumbnail: '/media/poster/52991.webp',
              synopsis:
                'During their journey, the elf mage Frieren reflects on the time she spent with her human companions.',
              season: 'Fall 2023',
              episodes: [
                { number: 1, date: '2023-09-29' },
                { number: 2, date: '2023-09-29' },
              ],
              characters: [
                {
                  name: 'Frieren',
                  imageUrl: '/media/character/frieren.webp',
                  role: 'Main',
                  voiceActor: {
                    name: 'Atsumi Tanezaki',
                    imageUrl: '/media/character/tanezaki.webp',
                  },
                },
              ],
            },
          },
        },
      },
      '400': { description: 'Invalid MAL id' },
      '404': { description: 'Anime not found' },
    },
  },
})

export default defineEventHandler(async event => {
  const malId = Number(getRouterParam(event, 'malId', { decode: true }))
  if (!Number.isInteger(malId) || malId <= 0) {
    throw createError({ status: 400, statusText: 'Invalid MAL id' })
  }

  const detail = await getAnimeDetail(malId)
  if (!detail) throw createError({ status: 404, statusText: 'Anime not found' })
  return detail
})
