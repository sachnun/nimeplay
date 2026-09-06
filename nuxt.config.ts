import tailwindcss from '@tailwindcss/vite'

function handleRollupWarning(warning: any, warn: (warning: any) => void) {
  if (
    warning.code === 'SOURCEMAP_BROKEN'
    && ['nuxt:module-preload-polyfill', '@tailwindcss/vite:generate:build'].includes(warning.plugin || '')
  ) return
  warn(warning)
}

export default defineNuxtConfig({
  ssr: true,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NODE_ENV === 'development' },
  experimental: {
    payloadExtraction: true,
    inlineRouteRules: true,
    renderJsonPayloads: true,
  },
  features: {
    inlineStyles: true,
  },
  routeRules: {
    '/': { isr: 180 },
    '/anime/:malId': { isr: 3600 },
    '/anime/:malId/:episode': { ssr: false },
    '/api/home': {
      cache: { maxAge: 180, staleMaxAge: 600 },
      headers: { 'cache-control': 'public, max-age=180, s-maxage=180, stale-while-revalidate=600' },
    },
    '/api/anime-page': {
      cache: { maxAge: 180, staleMaxAge: 600 },
      headers: { 'cache-control': 'public, max-age=180, s-maxage=180, stale-while-revalidate=600' },
    },
    '/api/genre/**': {
      cache: { maxAge: 600, staleMaxAge: 3600 },
      headers: { 'cache-control': 'public, max-age=600, s-maxage=600, stale-while-revalidate=3600' },
    },
    '/api/search': {
      cache: { maxAge: 60, staleMaxAge: 300 },
      headers: { 'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300' },
    },
    '/api/anime/:malId': {
      cache: { maxAge: 300, staleMaxAge: 3600 },
      headers: { 'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600' },
    },
    '/api/anime/:malId/:episode': {
      cache: { maxAge: 60, staleMaxAge: 300 },
      headers: { 'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300' },
    },
    '/r2/**': {
      cache: { maxAge: 31536000, staleMaxAge: 86400 },
      headers: { 'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable' },
    },
    '/posters/**': {
      cache: { maxAge: 86400, staleMaxAge: 86400 },
      headers: { 'cache-control': 'public, max-age=86400, s-maxage=86400' },
    },
    '/openapi.json': {
      cache: { maxAge: 3600, staleMaxAge: 3600 },
      headers: { 'cache-control': 'public, max-age=3600, s-maxage=3600' },
    },
    '/docs': { ssr: false },
  },
  nitro: {
    preset: 'cloudflare_module',
    compressPublicAssets: true,
    minify: true,
    experimental: {
      openAPI: true,
      tasks: true,
    },
    cloudflare: {
      deployConfig: true,
      wrangler: {
        name: 'nimeplay',
        compatibility_date: '2025-07-15',
        placement: {
          mode: 'smart',
          hint: 'apac',
        },
      },
    },
    openAPI: {
      meta: {
        title: 'Nimeplay API',
        description: 'Anime scraping and streaming API for Nimeplay',
        version: '1.0.0',
      },
      route: '/openapi.json',
      production: 'runtime',
      ui: {
        scalar: { route: '/docs' },
        swagger: false,
      },
    },
  },
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
        { name: 'theme-color', content: '#0a0a0a' },
        { name: 'google', content: 'notranslate' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }
      ]
    }
  },
  vite: {
    build: {
      sourcemap: false,
      cssCodeSplit: true,
      reportCompressedSize: false,
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
