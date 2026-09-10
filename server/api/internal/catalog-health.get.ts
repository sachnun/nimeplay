import { getCatalogHealth } from '../../utils/refresh'

export default defineEventHandler(() => {
  return getCatalogHealth()
})
