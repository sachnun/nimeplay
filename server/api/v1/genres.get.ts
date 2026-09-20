import { getGenreList } from '../../utils/queries'

defineRouteMeta({
  openAPI: {
    tags: ['Genre'],
    summary: 'List genres',
    description: 'Full genre list.',
    responses: {
      '200': { description: 'Genre list' },
    },
  },
})

export default defineEventHandler(async () => {
  const rows = await getGenreList()
  return { data: rows }
})
