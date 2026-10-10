const components = {
  schemas: {
    AnimeCard: {
      type: 'object',
      required: ['malId', 'title', 'thumbnail', 'episode', 'day', 'date'],
      properties: {
        malId: { type: 'integer', example: 52991 },
        title: { type: 'string', example: 'Sousou no Frieren' },
        thumbnail: { type: 'string', format: 'uri-reference', example: '/media/poster/52991.webp' },
        episode: { type: 'string', description: 'Latest episode label, empty when unknown', example: 'Episode 28' },
        day: { type: 'string', description: 'Broadcast weekday in Japan time, empty when unknown', example: 'Minggu' },
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
        thumbnail: { type: 'string', format: 'uri-reference', example: '/media/poster/52991.webp' },
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
        thumbnail: { type: 'string', format: 'uri-reference', example: '/media/poster/52991.webp' },
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
        imageUrl: { type: 'string', format: 'uri-reference', example: '/media/character/frieren.webp' },
        role: { type: 'string', enum: ['Main', 'Supporting'], example: 'Main' },
        voiceActor: {
          type: 'object',
          properties: {
            name: { type: 'string', example: 'Atsumi Tanezaki' },
            imageUrl: { type: 'string', format: 'uri-reference', example: '/media/character/tanezaki.webp' },
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
        thumbnail: { type: 'string', format: 'uri-reference', example: '/media/poster/52991.webp' },
        synopsis: {
          type: 'string',
          example:
            'During their journey, the elf mage Frieren reflects on the time she spent with her human companions.',
        },
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
        playUrl: { type: 'string', format: 'uri-reference', example: '/api/stream?t=abc123' },
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
            thumbnail: { type: 'string', format: 'uri-reference', example: '/media/poster/52991.webp' },
          },
        },
        episodeNumber: { type: 'integer', example: 1 },
        title: { type: 'string', example: 'Sousou no Frieren Episode 1' },
        thumbnail: { type: 'string', format: 'uri-reference', example: '/media/poster/52991.webp' },
        episodes: { type: 'array', items: { type: 'integer' }, example: [1, 2, 3] },
        servers: { type: 'array', items: { $ref: '#/components/schemas/EpisodeServer' } },
        stream: {
          type: ['object', 'null'],
          description: 'Null when stream=0 or no mirror resolved',
          oneOf: [{ $ref: '#/components/schemas/Stream' }, { type: 'null' }],
        },
      },
    },
    SkipTimes: {
      type: 'object',
      required: ['found', 'results'],
      properties: {
        found: { type: 'boolean', example: true },
        results: {
          type: 'array',
          items: {
            type: 'object',
            required: ['interval', 'skipType', 'skipId', 'episodeLength'],
            properties: {
              interval: {
                type: 'object',
                required: ['startTime', 'endTime'],
                properties: {
                  startTime: { type: 'number', example: 310.571 },
                  endTime: { type: 'number', example: 400.571 },
                },
              },
              skipType: {
                type: 'string',
                enum: ['op', 'ed', 'mixed-op', 'mixed-ed', 'recap'],
                example: 'op',
              },
              skipId: { type: 'string', example: 'd4f34b6d-0547-4438-ac93-b25b577eddd5' },
              episodeLength: { type: 'number', example: 1443.984 },
            },
          },
        },
      },
    },
  },
}

const json = (schema: unknown, example?: unknown) => ({
  'application/json': { schema, ...(example ? { example } : {}) },
})

const errorResponse = (description: string) => ({ description })

export const openApiDocument = {
  openapi: '3.0.3',
  info: { title: 'Nimeplay API', version: '1.0.0' },
  tags: [{ name: 'Anime' }, { name: 'Genre' }],
  components,
  paths: {
    '/api/v1/anime': {
      get: {
        tags: ['Anime'],
        summary: 'List anime',
        description:
          'Paginated list of ongoing or completed anime. Set q to search by title, alternate titles, studio, genre, character, or synopsis.',
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
          {
            name: 'genre',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Genre slug used to rank matching anime first when q is set',
            example: 'action',
          },
        ],
        responses: {
          '200': {
            description: 'Anime listing, or search results when q is set',
            content: json({
              type: 'object',
              oneOf: [{ $ref: '#/components/schemas/AnimeList' }, { $ref: '#/components/schemas/SearchList' }],
            }),
          },
        },
      },
    },
    '/api/v1/anime/{malId}': {
      get: {
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
            content: json({ $ref: '#/components/schemas/AnimeDetail' }),
          },
          '400': errorResponse('Invalid MAL id'),
          '404': errorResponse('Anime not found'),
        },
      },
    },
    '/api/v1/anime/{malId}/{episode}': {
      get: {
        tags: ['Anime'],
        summary: 'Watch episode',
        description:
          'Resolve an episode to a ready-to-play stream URL. Pick a server with server and quality, defaults to the best server.',
        parameters: [
          {
            name: 'malId',
            in: 'path',
            required: true,
            schema: { type: 'integer' },
            description: 'MyAnimeList ID',
            example: 52991,
          },
          {
            name: 'episode',
            in: 'path',
            required: true,
            schema: { type: 'integer', minimum: 1 },
            description: 'Episode number',
            example: 1,
          },
          {
            name: 'server',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Preferred server name, see servers in the response',
            example: 'blogger',
          },
          {
            name: 'quality',
            in: 'query',
            required: false,
            schema: { type: 'string' },
            description: 'Preferred quality, for example 720p',
            example: '720p',
          },
          {
            name: 'stream',
            in: 'query',
            required: false,
            schema: { type: 'string', enum: ['1', '0'], default: '1' },
            description: 'Set to 0 to skip resolving a playable stream URL',
            example: '1',
          },
        ],
        responses: {
          '200': {
            description: 'Episode with direct stream URL',
            content: json({ $ref: '#/components/schemas/EpisodeResponse' }),
          },
          '400': errorResponse('Invalid MAL id or episode number'),
          '404': errorResponse('Episode not found'),
        },
      },
    },
    '/api/v1/genres': {
      get: {
        tags: ['Genre'],
        summary: 'List genres',
        description: 'Full genre list.',
        responses: {
          '200': {
            description: 'Genre list',
            content: json(
              {
                type: 'object',
                required: ['data'],
                properties: { data: { type: 'array', items: { $ref: '#/components/schemas/Genre' } } },
              },
              { data: [{ name: 'Action', slug: 'action' }] },
            ),
          },
        },
      },
    },
    '/api/v1/genre/{slug}': {
      get: {
        tags: ['Genre'],
        summary: 'List anime by genre',
        description: 'Paginated anime list for a genre.',
        parameters: [
          {
            name: 'slug',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            description: 'Genre slug, see GET /api/v1/genres',
          },
          {
            name: 'page',
            in: 'query',
            required: false,
            schema: { type: 'integer', minimum: 1, default: 1 },
            description: 'Page number',
            example: 1,
          },
        ],
        responses: {
          '200': {
            description: 'Anime listing for the genre',
            content: json({
              type: 'object',
              required: ['data', 'page', 'totalPages'],
              properties: {
                data: { type: 'array', items: { $ref: '#/components/schemas/GenreAnimeCard' } },
                page: { type: 'integer', example: 1 },
                totalPages: { type: 'integer', example: 12 },
              },
            }),
          },
          '404': errorResponse('Genre not found'),
        },
      },
    },
    '/api/v1/skip': {
      post: {
        tags: ['Anime'],
        summary: 'Episode skip times',
        description:
          'Resolve opening, ending and recap skip times for an episode through AniSkip. Returns an empty list with found=false when no skip times exist, never a 404.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['malId', 'episode', 'episodeLength'],
                properties: {
                  malId: { type: 'integer', example: 52991, description: 'MyAnimeList ID' },
                  episode: { type: 'integer', minimum: 1, example: 1, description: 'Episode number' },
                  episodeLength: {
                    type: 'number',
                    example: 1440,
                    description: 'Episode duration in seconds, measured by the player',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Skip times, empty when none are found',
            content: json({ $ref: '#/components/schemas/SkipTimes' }),
          },
          '400': errorResponse('Invalid malId, episode or episodeLength'),
        },
      },
    },
  },
}
