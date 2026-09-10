import { getCatalogHealth } from '../../utils/refresh'

defineRouteMeta({
  openAPI: false,
})

export default defineEventHandler(() => {
  return getCatalogHealth()
})
