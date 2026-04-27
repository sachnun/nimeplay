import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export default defineNuxtPlugin(() => {
  if (Capacitor.getPlatform() !== 'android') return

  const router = useRouter()

  App.addListener('backButton', ({ canGoBack }) => {
    const path = router.currentRoute.value.path

    if (canGoBack) {
      window.history.back()
      return
    }

    const segments = path.split('/').filter(Boolean)

    if (segments.length > 1) {
      router.replace(`/${segments[0]}`)
      return
    }

    if (segments.length === 1) {
      router.replace('/')
      return
    }

    App.exitApp()
  })
})
