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

export default defineEventHandler(async (event) => {
  const rows = await getGenreList(event)
  return { data: rows }
})
