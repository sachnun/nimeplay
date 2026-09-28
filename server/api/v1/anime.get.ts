import { getQuery } from 'h3'
import { listAnimePage } from '../../utils/db/queries/catalog'
import { searchAnime } from '../../utils/db/queries/search'
import { toAbsoluteUrl } from '../../utils/media'

defineRouteMeta({
  openAPI: {
    tags: ['Anime'],
    summary: 'List anime',
    description: 'Paginated list of ongoing or completed anime. Set q to search by title, alternate titles, studio, genre, character, or synopsis.',
    parameters: [
      {
        name: 'type',
        in: 'query',
        required: false,
        schema: { type: 'string', enum: ['ongoing', 'completed'], default: 'ongoing' },
        description: 'Catalog type',
      },
      {
        name: 'page',
        in: 'query',
        required: false,
        schema: { type: 'integer', minimum: 1, default: 1 },
        description: 'Page number',
        example: 1,
      },
      {
        name: 'q',
        in: 'query',
        required: false,
        schema: { type: 'string' },
        description: 'Search anime across titles, studio, genres, characters, and synopsis',
        example: 'frieren',
      },
    ],
    responses: {
      '200': {
        description: 'Anime listing, or search results when q is set',
        content: {
          'application/json': {
            schema: {
              oneOf: [
                { $ref: '#/components/schemas/AnimeList' },
                { $ref: '#/components/schemas/SearchList' },
              ],
            },
            examples: {
              list: {
                value: {
                  data: [{
                    malId: 52991,
                    title: 'Sousou no Frieren',
                    thumbnail: 'https://nimeplay.example/media/poster/52991.webp',
                    episode: 'Episode 28',
                    day: 'Friday',
                    date: 'Fall 2023',
                    rating: '9.3',
                  }],
                  page: 1,
                  totalPages: 12,
                },
              },
              search: {
                value: {
                  data: [{
                    malId: 52991,
                    title: 'Sousou no Frieren',
                    thumbnail: 'https://nimeplay.example/media/poster/52991.webp',
                    genres: 'Adventure, Drama, Fantasy',
                    status: 'ONGOING',
                    rating: '9.3',
                  }],
                  page: 1,
                  totalPages: 1,
                },
              },
            },
          },
        },
      },
    },
    $global: {
      components: {
        schemas: {
          AnimeCard: {
            type: 'object',
            required: ['malId', 'title', 'thumbnail', 'episode', 'day', 'date'],
            properties: {
              malId: { type: 'integer', example: 52991 },
              title: { type: 'string', example: 'Sousou no Frieren' },
              thumbnail: { type: 'string', format: 'uri', example: 'https://nimeplay.example/media/poster/52991.webp' },
              episode: { type: 'string', description: 'Latest episode label, empty when unknown', example: 'Episode 28' },
              day: { type: 'string', description: 'Broadcast day, empty when unknown', example: 'Friday' },
              date: { type: 'string', description: 'Season label', example: 'Fall 2023' },
              rating: { type: 'string', description: 'Score, omitted when unknown', example: '9.3' },
            },
          },
          SearchResult: {
            type: 'object',
            required: ['malId', 'title', 'thumbnail', 'genres', 'status', 'rating'],
            properties: {
              malId: { type: 'integer', example: 52991 },
              title: { type: 'string', example: 'Sousou no Frieren' },
              thumbnail: { type: 'string', format: 'uri', example: 'https://nimeplay.example/media/poster/52991.webp' },
              genres: { type: 'string', description: 'Comma-separated genre names', example: 'Adventure, Drama, Fantasy' },
              status: { type: 'string', enum: ['ONGOING', 'COMPLETED'], example: 'ONGOING' },
              rating: { type: 'string', example: '9.3' },
            },
          },
          AnimeList: {
            type: 'object',
            required: ['data', 'page', 'totalPages'],
            properties: {
              data: { type: 'array', items: { $ref: '#/components/schemas/AnimeCard' } },
              page: { type: 'integer', example: 1 },
              totalPages: { type: 'integer', example: 12 },
            },
          },
          SearchList: {
            type: 'object',
            required: ['data', 'page', 'totalPages'],
            properties: {
              data: { type: 'array', items: { $ref: '#/components/schemas/SearchResult' } },
              page: { type: 'integer', example: 1 },
              totalPages: { type: 'integer', example: 1 },
            },
          },
          Genre: {
            type: 'object',
            required: ['name', 'slug'],
            properties: {
              name: { type: 'string', example: 'Action' },
              slug: { type: 'string', example: 'action' },
            },
          },
          GenreAnimeCard: {
            type: 'object',
            required: ['malId', 'title', 'thumbnail', 'studio', 'episodes', 'rating', 'genres', 'date'],
            properties: {
              malId: { type: 'integer', example: 52991 },
              title: { type: 'string', example: 'Sousou no Frieren' },
              thumbnail: { type: 'string', format: 'uri', example: 'https://nimeplay.example/media/poster/52991.webp' },
              studio: { type: 'string', example: '' },
              episodes: { type: 'string', example: '28 Eps' },
              rating: { type: 'string', example: '9.3' },
              genres: { type: 'string', example: 'Adventure, Drama, Fantasy' },
              date: { type: 'string', example: 'Fall 2023' },
            },
          },
          Character: {
            type: 'object',
            required: ['name', 'imageUrl', 'role'],
            properties: {
              name: { type: 'string', example: 'Frieren' },
              imageUrl: { type: 'string', format: 'uri', example: 'https://nimeplay.example/media/character/frieren.webp' },
              role: { type: 'string', enum: ['Main', 'Supporting'], example: 'Main' },
              voiceActor: {
                type: 'object',
                properties: {
                  name: { type: 'string', example: 'Atsumi Tanezaki' },
                  imageUrl: { type: 'string', format: 'uri', example: 'https://nimeplay.example/media/character/tanezaki.webp' },
                },
              },
            },
          },
          AnimeDetail: {
            type: 'object',
            required: ['malId', 'title', 'genres', 'thumbnail', 'synopsis', 'episodes', 'characters'],
            properties: {
              malId: { type: 'integer', example: 52991 },
              title: { type: 'string', example: 'Sousou no Frieren' },
              japanese: { type: 'string', example: '' },
              score: { type: 'string', example: '9.3' },
              producer: { type: 'string', example: '' },
              type: { type: 'string', example: 'TV' },
              status: { type: 'string', enum: ['Ongoing', 'Completed'], example: 'Ongoing' },
              totalEpisode: { type: 'string', example: '28' },
              duration: { type: 'string', example: '' },
              releaseDate: { type: 'string', example: '' },
              studio: { type: 'string', example: 'Madhouse' },
              season: { type: 'string', example: 'Fall 2023' },
              genres: { type: 'array', items: { $ref: '#/components/schemas/Genre' } },
              thumbnail: { type: 'string', format: 'uri', example: 'https://nimeplay.example/media/poster/52991.webp' },
              synopsis: { type: 'string', example: 'During their journey, the elf mage Frieren reflects on the time she spent with her human companions.' },
              episodes: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['number', 'date'],
                  properties: {
                    number: { type: 'integer', example: 1 },
                    date: { type: 'string', example: '2023-09-29' },
                  },
                },
              },
              characters: { type: 'array', items: { $ref: '#/components/schemas/Character' } },
            },
          },
          EpisodeServer: {
            type: 'object',
            required: ['server', 'quality'],
            properties: {
              server: { type: 'string', example: 'blogger' },
              quality: { type: 'string', example: '720p' },
            },
          },
          Stream: {
            type: 'object',
            required: ['playUrl', 'kind', 'quality', 'server'],
            properties: {
              playUrl: { type: 'string', format: 'uri', example: 'https://nimeplay.example/api/stream?key=abc123' },
              kind: { type: 'string', enum: ['hls', 'file'], example: 'hls' },
              quality: { type: 'string', example: '720p' },
              server: { type: 'string', example: 'blogger' },
            },
          },
          EpisodeResponse: {
            type: 'object',
            required: ['anime', 'episodeNumber', 'title', 'thumbnail', 'episodes', 'servers', 'stream'],
            properties: {
              anime: {
                type: 'object',
                required: ['malId', 'title', 'thumbnail'],
                properties: {
                  malId: { type: 'integer', example: 52991 },
                  title: { type: 'string', example: 'Sousou no Frieren' },
                  thumbnail: { type: 'string', format: 'uri', example: 'https://nimeplay.example/media/poster/52991.webp' },
                },
              },
              episodeNumber: { type: 'integer', example: 1 },
              title: { type: 'string', example: 'Sousou no Frieren Episode 1' },
              thumbnail: { type: 'string', format: 'uri', example: 'https://nimeplay.example/media/poster/52991.webp' },
              episodes: { type: 'array', items: { type: 'integer' }, example: [1, 2, 3] },
              servers: { type: 'array', items: { $ref: '#/components/schemas/EpisodeServer' } },
              stream: {
                description: 'Null when stream=0 or no mirror resolved',
                oneOf: [{ $ref: '#/components/schemas/Stream' }, { type: 'null' }],
              },
            },
          },
        },
      },
    },
  },
})

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = String(query.q ?? '').trim()
  if (q) {
    setHeader(event, 'Cache-Control', 'public, max-age=30, s-maxage=120, stale-while-revalidate=300')
    const origin = getRequestURL(event).origin
    const rows = await searchAnime(q)
    return { data: rows.map(row => ({ ...row, thumbnail: toAbsoluteUrl(row.thumbnail, origin) })), page: 1, totalPages: 1 }
  }

  const rawType = String(query.type || 'ongoing').toUpperCase()
  const status = rawType === 'COMPLETED' ? 'COMPLETED' : 'ONGOING'
  const page = Math.max(1, Number(query.page) || 1)

  setHeader(event, 'Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=600')
  const result = await listAnimePage(status, page)
  return { data: result.anime.map(item => ({ ...item, thumbnail: toAbsoluteUrl(item.thumbnail, getRequestURL(event).origin) })), page, totalPages: result.totalPages }
})
