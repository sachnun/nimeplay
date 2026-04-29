import tailwindcss from '@tailwindcss/vite'

const isAndroidStatic = process.env.NUXT_ANDROID_STATIC === '1'

function handleRollupWarning(warning: any, warn: (warning: any) => void) {
  if (
    warning.code === 'SOURCEMAP_BROKEN'
    && ['nuxt:module-preload-polyfill', '@tailwindcss/vite:generate:build'].includes(warning.plugin || '')
  ) return
  warn(warning)
}

export default defineNuxtConfig({
  ssr: !isAndroidStatic,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NODE_ENV === 'development' },
  ...(isAndroidStatic ? { nitro: { prerender: { crawlLinks: false, routes: ['/'] } } } : {}),
  modules: ['@nuxt/fonts'],
  sourcemap: { server: false, client: false },
  css: ['~/assets/css/main.css'],
  fonts: {
    families: [
      { name: 'Geist', provider: 'fontsource', weights: ['400', '500', '600', '700'], styles: ['normal'], subsets: ['latin'], global: true },
      { name: 'Geist Mono', provider: 'fontsource', weights: ['400'], styles: ['normal'], subsets: ['latin'], global: true },
    ],
  },
  app: {
    head: {
      htmlAttrs: { lang: 'id', class: 'h-full antialiased notranslate', translate: 'no' },
      bodyAttrs: { class: 'min-h-full' },
      title: 'Nimeplay',
      titleTemplate: '%s - Nimeplay',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }
      ],
      meta: [
        { name: 'description', content: 'Minimal anime streaming' },
        { name: 'google', content: 'notranslate' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }
      ]
    }
  },
  vite: {
    build: {
      sourcemap: false,
      rollupOptions: {
        onwarn: handleRollupWarning,
      },
    },
    $server: {
      build: {
        rollupOptions: {
          onwarn(warning, warn) {
            if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return
            handleRollupWarning(warning, warn)
          },
        },
      },
    },
    plugins: [tailwindcss()]
  }
})
