import { runPosterMigration } from '../../utils/poster-migrate'

defineRouteMeta({
  openAPI: {
    tags: ['Internal'],
    summary: 'Mirror poster images into R2',
    description: 'Uploads the MyAnimeList poster image URLs already stored in the database into the R2 bucket and repoints each row at the local cache path. Paced to respect MAL CDN limits; resumable, so run repeatedly until remaining is zero.',
    responses: {
      '200': { description: 'Migration batch finished; skipped=true when the POSTERS binding is unavailable' },
    },
  },
})

export default defineEventHandler(async () => {
  return runPosterMigration()
})
