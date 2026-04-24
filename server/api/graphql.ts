import { ApolloServer } from '@apollo/server'
import { startServerAndCreateH3Handler } from '@as-integrations/h3'
import { fetchMalId, fetchSkipTimes } from '../utils/aniskip'
import { cached } from '../utils/cache'
import { extractStreamUrl, probeIframeUrl } from '../utils/extractors'
import { fetchJikanData } from '../utils/jikan'
import {
  resolvemirror,
  scrapeAnimeDetail,
  scrapeCompleted,
  scrapeEpisode,
  scrapeGenre,
  scrapeGenreList,
  scrapeOngoing,
  scrapeSearch,
} from '../utils/scraper'

const typeDefs = `#graphql
  type AnimeCard {
    title: String!
    slug: String!
    thumbnail: String!
    episode: String!
    day: String!
    date: String!
    rating: String
  }

  type AnimePage {
    anime: [AnimeCard!]!
    totalPages: Int!
  }

  type Genre {
    name: String!
    slug: String!
  }

  type AnimeEpisode {
    title: String!
    slug: String!
    date: String!
  }

  type AnimeDetail {
    title: String!
    japanese: String!
    score: String!
    producer: String!
    type: String!
    status: String!
    totalEpisode: String!
    duration: String!
    releaseDate: String!
    studio: String!
    genres: [Genre!]!
    thumbnail: String!
    synopsis: String!
    episodes: [AnimeEpisode!]!
  }

  type EpisodeMirrorSource {
    name: String!
    dataContent: String!
  }

  type EpisodeMirror {
    quality: String!
    sources: [EpisodeMirrorSource!]!
  }

  type EpisodeNavItem {
    title: String!
    slug: String!
  }

  type EpisodeData {
    title: String!
    animeSlug: String!
    animeTitle: String!
    defaultIframeSrc: String!
    mirrors: [EpisodeMirror!]!
    episodeNav: [EpisodeNavItem!]!
    thumbnail: String!
  }

  type SearchResult {
    title: String!
    slug: String!
    thumbnail: String!
    genres: String!
    status: String!
    rating: String!
  }

  type GenreAnimeCard {
    title: String!
    slug: String!
    thumbnail: String!
    studio: String!
    episodes: String!
    rating: String!
    genres: String!
    date: String!
  }

  type GenreAnimePage {
    anime: [GenreAnimeCard!]!
    totalPages: Int!
  }

  type JikanVoiceActor {
    name: String!
    imageUrl: String!
  }

  type JikanCharacter {
    name: String!
    imageUrl: String!
    role: String!
    voiceActor: JikanVoiceActor
  }

  type JikanAnimeData {
    malId: Int!
    synopsisEn: String!
    background: String!
    malScore: Float
    malRank: Int
    popularity: Int
    rating: String!
    season: String
    year: Int
    trailerEmbedUrl: String
    characters: [JikanCharacter!]!
  }

  type SkipInterval {
    startTime: Float!
    endTime: Float!
  }

  type SkipTime {
    interval: SkipInterval!
    skipType: String!
    skipId: String!
    episodeLength: Float!
  }

  type SkipTimesLookupResult {
    malId: Int
    skipTimes: [SkipTime!]!
  }

  type HomeData {
    ongoingData: AnimePage!
    completedData: AnimePage!
    genres: [Genre!]!
  }

  type EpisodePageData {
    anime: EpisodePageAnime
    episodeSlug: String
    episode: EpisodeData
  }

  type EpisodePageAnime {
    thumbnail: String!
  }

  type AnimeDetailLookup {
    slug: String!
    anime: AnimeDetail
  }

  type MalIdResult {
    malId: Int
  }

  type ResolveMirrorResult {
    iframeUrl: String
  }

  type ProbeIframeResult {
    ok: Boolean!
  }

  type ExtractStreamResult {
    proxiedUrl: String
    iframeUrl: String!
  }

  type PrepareMirrorResult {
    iframeUrl: String
    proxiedUrl: String
    ok: Boolean!
  }

  enum AnimePageType {
    ONGOING
    COMPLETED
  }

  type Query {
    home: HomeData!
    anime(slug: String!): AnimeDetail
    animeDetails(slugs: [String!]!): [AnimeDetailLookup!]!
    episode(slug: String!): EpisodeData
    episodePage(animeSlug: String!, episode: String!): EpisodePageData!
    animePage(type: AnimePageType!, page: Int = 1): AnimePage!
    genres: [Genre!]!
    genre(slug: String!, page: Int = 1): GenreAnimePage!
    search(query: String!): [SearchResult!]!
    jikanAnime(title: String!, japaneseTitle: String, cachedMalId: Int): JikanAnimeData
    aniskipMalId(title: String!): MalIdResult!
    skipTimes(malId: Int!, episode: Int!, episodeLength: Float!): [SkipTime!]!
    skipTimesLookup(title: String!, episode: Int!, episodeLength: Float!): SkipTimesLookupResult!
  }

  type Mutation {
    resolveMirror(dataContent: String!): ResolveMirrorResult!
    probeIframe(iframeUrl: String!): ProbeIframeResult!
    extractStream(iframeUrl: String!): ExtractStreamResult!
    prepareMirror(dataContent: String!, extract: Boolean!): PrepareMirrorResult!
  }
`

const MIRROR_PREPARE_TTL = 10 * 60 * 1000

function episodeNumberFromTitle(title: string, index: number) {
  return title.match(/episode\s*(\d+)/i)?.[1] ?? `${index + 1}`
}

const resolvers = {
  Query: {
    home: async () => {
      const [ongoingData, completedData, genres] = await Promise.all([
        scrapeOngoing(1),
        scrapeCompleted(1),
        scrapeGenreList(),
      ])

      return { ongoingData, completedData, genres }
    },
    anime: (_parent: unknown, args: { slug: string }) => scrapeAnimeDetail(args.slug),
    animeDetails: async (_parent: unknown, args: { slugs: string[] }) => {
      const seen = new Set<string>()
      const slugs = args.slugs.map((slug) => slug.trim()).filter((slug) => slug && !seen.has(slug) && seen.add(slug))
      return Promise.all(slugs.map(async (slug) => {
        try {
          return { slug, anime: await scrapeAnimeDetail(slug) }
        } catch {
          return { slug, anime: null }
        }
      }))
    },
    episode: (_parent: unknown, args: { slug: string }) => scrapeEpisode(args.slug),
    episodePage: async (_parent: unknown, args: { animeSlug: string; episode: string }) => {
      const animeSlug = args.animeSlug.trim()
      const episodeNumber = args.episode.trim()
      if (!animeSlug || !episodeNumber) return { anime: null, episodeSlug: null, episode: null }

      const anime = await scrapeAnimeDetail(animeSlug)
      if (!anime) return { anime: null, episodeSlug: null, episode: null }

      const reversed = [...anime.episodes].reverse()
      const match = reversed.find((episode, index) => episodeNumberFromTitle(episode.title, index) === episodeNumber)
      const pageAnime = { thumbnail: anime.thumbnail }
      if (!match) return { anime: pageAnime, episodeSlug: null, episode: null }

      return { anime: pageAnime, episodeSlug: match.slug, episode: await scrapeEpisode(match.slug) }
    },
    animePage: (_parent: unknown, args: { type: 'ONGOING' | 'COMPLETED'; page?: number }) => {
      const page = args.page || 1
      return args.type === 'COMPLETED' ? scrapeCompleted(page) : scrapeOngoing(page)
    },
    genres: () => scrapeGenreList(),
    genre: (_parent: unknown, args: { slug: string; page?: number }) => scrapeGenre(args.slug, args.page || 1),
    search: (_parent: unknown, args: { query: string }) => {
      const query = args.query.trim()
      return query ? scrapeSearch(query) : []
    },
    jikanAnime: (_parent: unknown, args: { title: string; japaneseTitle?: string | null; cachedMalId?: number | null }) => {
      const title = args.title.trim()
      if (!title) return null
      return fetchJikanData(title, args.japaneseTitle || undefined, args.cachedMalId || null)
    },
    aniskipMalId: async (_parent: unknown, args: { title: string }) => {
      const title = args.title.trim()
      return { malId: title ? await fetchMalId(title) : null }
    },
    skipTimes: (_parent: unknown, args: { malId: number; episode: number; episodeLength: number }) => {
      if (!args.malId || !args.episode || !args.episodeLength) return []
      return fetchSkipTimes(args.malId, args.episode, args.episodeLength)
    },
    skipTimesLookup: async (_parent: unknown, args: { title: string; episode: number; episodeLength: number }) => {
      const title = args.title.trim()
      if (!title || !args.episode || !args.episodeLength) return { malId: null, skipTimes: [] }
      const malId = await fetchMalId(title)
      return { malId, skipTimes: malId ? await fetchSkipTimes(malId, args.episode, args.episodeLength) : [] }
    },
  },
  Mutation: {
    resolveMirror: async (_parent: unknown, args: { dataContent: string }) => ({
      iframeUrl: await resolvemirror(args.dataContent),
    }),
    probeIframe: async (_parent: unknown, args: { iframeUrl: string }) => ({
      ok: await probeIframeUrl(args.iframeUrl),
    }),
    extractStream: (_parent: unknown, args: { iframeUrl: string }) => extractStreamUrl(args.iframeUrl),
    prepareMirror: (_parent: unknown, args: { dataContent: string; extract: boolean }) => cached(
      `prepare-mirror:${args.extract ? 'extract' : 'probe'}:${args.dataContent}`,
      MIRROR_PREPARE_TTL,
      async () => {
      const iframeUrl = await resolvemirror(args.dataContent)
      if (!iframeUrl) return { iframeUrl: null, proxiedUrl: null, ok: false }
      if (!args.extract) return { iframeUrl, proxiedUrl: null, ok: await probeIframeUrl(iframeUrl) }

      const extracted = await extractStreamUrl(iframeUrl)
      return { iframeUrl: extracted.iframeUrl, proxiedUrl: extracted.proxiedUrl, ok: !!extracted.proxiedUrl }
      },
    ),
  },
}

const apollo = new ApolloServer({ typeDefs, resolvers })

export default startServerAndCreateH3Handler(apollo)
