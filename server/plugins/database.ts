import { registerNeonDatabase } from '../utils/db-neon'

export default defineNitroPlugin(() => {
  registerNeonDatabase()
})
