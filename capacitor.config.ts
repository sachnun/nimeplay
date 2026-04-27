import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'dev.sachnun.nimeplay',
  appName: 'Nimeplay',
  webDir: 'www',
  backgroundColor: '#000000',
  initialFocus: true,
  server: {
    url: 'https://nimeplay-nuxt.sachnun.workers.dev',
    allowNavigation: ['nimeplay-nuxt.sachnun.workers.dev'],
  },
  android: {
    backgroundColor: '#000000',
  },
}

export default config
