

defineRouteMeta({
  openAPI: {
    tags: ['Home'],
    summary: 'Get home page data',
    description: 'Returns the first page of ongoing anime, completed anime and the genre list in parallel.',
    responses: {
      '200': { description: 'Home page payload' },
    },
  },
})

export default defineEventHandler(async (event) => {
  const [ongoingData, completedData, genres] = await Promise.all([
    scrapeOngoing(1).catch(() => ({ anime: [], totalPages: 1 })),
    scrapeCompleted(1).catch(() => ({ anime: [], totalPages: 1 })),
    scrapeGenreList().catch(() => []),
  ])

  return { ongoingData, completedData, genres }
})
