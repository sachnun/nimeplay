

export default defineEventHandler(async (event) => {
  setApiCorsHeaders(event)
  const query = getQuery(event)
  const animeSlug = String(query.animeSlug || '').trim()
  const episodeNumber = String(query.episode || '').trim()

  if (!animeSlug || !episodeNumber) return { anime: null, episodeSlug: null, episode: null }

  const anime = await scrapeAnimeDetail(animeSlug)
  if (!anime) return { anime: null, episodeSlug: null, episode: null }

  function episodeNumberFromTitle(title: string, index: number) {
    return title.match(/episode\s*(\d+)/i)?.[1] ?? `${index + 1}`
  }

  const reversed = [...anime.episodes].reverse()
  const match = reversed.find((episode, index) => episodeNumberFromTitle(episode.title, index) === episodeNumber)
  const pageAnime = { thumbnail: anime.thumbnail }
  if (!match) return { anime: pageAnime, episodeSlug: null, episode: null }

  return { anime: pageAnime, episodeSlug: match.slug, episode: await scrapeEpisode(match.slug) }
})
