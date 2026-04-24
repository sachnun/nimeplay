import { gql } from '@apollo/client/core'

const ANIME_CARD_FIELDS = gql`
  fragment AnimeCardFields on AnimeCard {
    title
    slug
    thumbnail
    episode
    day
    date
    rating
  }
`

const GENRE_FIELDS = gql`
  fragment GenreFields on Genre {
    name
    slug
  }
`

const ANIME_DETAIL_FIELDS = gql`
  ${GENRE_FIELDS}

  fragment AnimeDetailFields on AnimeDetail {
    title
    japanese
    score
    producer
    type
    status
    totalEpisode
    duration
    releaseDate
    studio
    genres {
      ...GenreFields
    }
    thumbnail
    synopsis
    episodes {
      title
      slug
      date
    }
  }
`

const EPISODE_FIELDS = gql`
  fragment EpisodeFields on EpisodeData {
    title
    animeSlug
    animeTitle
    defaultIframeSrc
    mirrors {
      quality
      sources {
        name
        dataContent
      }
    }
    episodeNav {
      title
      slug
    }
    thumbnail
  }
`

const JIKAN_FIELDS = gql`
  fragment JikanFields on JikanAnimeData {
    malId
    synopsisEn
    background
    malScore
    malRank
    popularity
    rating
    season
    year
    trailerEmbedUrl
    characters {
      name
      imageUrl
      role
      voiceActor {
        name
        imageUrl
      }
    }
  }
`

const SKIP_TIME_FIELDS = gql`
  fragment SkipTimeFields on SkipTime {
    interval {
      startTime
      endTime
    }
    skipType
    skipId
    episodeLength
  }
`

export const HOME_QUERY = gql`
  ${ANIME_CARD_FIELDS}
  ${GENRE_FIELDS}

  query Home {
    home {
      ongoingData {
        anime {
          ...AnimeCardFields
        }
        totalPages
      }
      completedData {
        anime {
          ...AnimeCardFields
        }
        totalPages
      }
      genres {
        ...GenreFields
      }
    }
  }
`

export const ANIME_QUERY = gql`
  ${ANIME_DETAIL_FIELDS}

  query Anime($slug: String!) {
    anime(slug: $slug) {
      ...AnimeDetailFields
    }
  }
`

export const ANIME_DETAILS_QUERY = gql`
  ${ANIME_DETAIL_FIELDS}

  query AnimeDetails($slugs: [String!]!) {
    animeDetails(slugs: $slugs) {
      slug
      anime {
        ...AnimeDetailFields
      }
    }
  }
`

export const EPISODE_QUERY = gql`
  ${EPISODE_FIELDS}

  query Episode($slug: String!) {
    episode(slug: $slug) {
      ...EpisodeFields
    }
  }
`

export const EPISODE_PAGE_QUERY = gql`
  ${ANIME_DETAIL_FIELDS}
  ${EPISODE_FIELDS}

  query EpisodePage($animeSlug: String!, $episode: String!) {
    episodePage(animeSlug: $animeSlug, episode: $episode) {
      anime {
        ...AnimeDetailFields
      }
      episodeSlug
      episode {
        ...EpisodeFields
      }
    }
  }
`

export const ANIME_PAGE_QUERY = gql`
  ${ANIME_CARD_FIELDS}

  query AnimePage($type: AnimePageType!, $page: Int = 1) {
    animePage(type: $type, page: $page) {
      anime {
        ...AnimeCardFields
      }
      totalPages
    }
  }
`

export const GENRE_PAGE_QUERY = gql`
  query GenrePage($slug: String!, $page: Int = 1) {
    genre(slug: $slug, page: $page) {
      anime {
        title
        slug
        thumbnail
        studio
        episodes
        rating
        genres
        date
      }
      totalPages
    }
  }
`

export const SEARCH_QUERY = gql`
  query Search($query: String!) {
    search(query: $query) {
      title
      slug
      thumbnail
      genres
      status
      rating
    }
  }
`

export const JIKAN_ANIME_QUERY = gql`
  ${JIKAN_FIELDS}

  query JikanAnime($title: String!, $japaneseTitle: String, $cachedMalId: Int) {
    jikanAnime(title: $title, japaneseTitle: $japaneseTitle, cachedMalId: $cachedMalId) {
      ...JikanFields
    }
  }
`

export const ANISKIP_MAL_ID_QUERY = gql`
  query AniskipMalId($title: String!) {
    aniskipMalId(title: $title) {
      malId
    }
  }
`

export const SKIP_TIMES_QUERY = gql`
  ${SKIP_TIME_FIELDS}

  query SkipTimes($malId: Int!, $episode: Int!, $episodeLength: Float!) {
    skipTimes(malId: $malId, episode: $episode, episodeLength: $episodeLength) {
      ...SkipTimeFields
    }
  }
`

export const SKIP_TIMES_LOOKUP_QUERY = gql`
  ${SKIP_TIME_FIELDS}

  query SkipTimesLookup($title: String!, $episode: Int!, $episodeLength: Float!) {
    skipTimesLookup(title: $title, episode: $episode, episodeLength: $episodeLength) {
      malId
      skipTimes {
        ...SkipTimeFields
      }
    }
  }
`

export const RESOLVE_MIRROR_MUTATION = gql`
  mutation ResolveMirror($dataContent: String!) {
    resolveMirror(dataContent: $dataContent) {
      iframeUrl
    }
  }
`

export const PROBE_IFRAME_MUTATION = gql`
  mutation ProbeIframe($iframeUrl: String!) {
    probeIframe(iframeUrl: $iframeUrl) {
      ok
    }
  }
`

export const EXTRACT_STREAM_MUTATION = gql`
  mutation ExtractStream($iframeUrl: String!) {
    extractStream(iframeUrl: $iframeUrl) {
      proxiedUrl
      iframeUrl
    }
  }
`

export const PREPARE_MIRROR_MUTATION = gql`
  mutation PrepareMirror($dataContent: String!, $extract: Boolean!) {
    prepareMirror(dataContent: $dataContent, extract: $extract) {
      iframeUrl
      proxiedUrl
      ok
    }
  }
`
