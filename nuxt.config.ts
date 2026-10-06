import tailwindcss from '@tailwindcss/vite'

const apiCors = {
  methods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type'],
  maxAge: '86400',
}

export default defineNuxtConfig({
  runtimeConfig: {
    databaseUrl: '',
    awsAccessKeyId: '',
    awsSecretAccessKey: '',
    awsEndpointUrlS3: '',
    awsRegion: 'us-east-1',
    mediaBucket: 'nimeplay',
    streamSecret: '',
  },
  compatibilityDate: '2025-07-15',
  nitro: {
    preset: 'cloudflare_module',
    devServer: { runner: 'node-worker' },
    imports: {
      dirs: ['server/utils/**'],
    },
    experimental: {
      openAPI: true,
    },
    cloudflare: {
      deployConfig: true,
      wrangler: {
        name: 'nimeplay',
        compatibility_date: '2026-09-11',
        placement: {
          mode: 'targeted',
          region: 'gcp:asia-southeast2',
        },
        vars: {
          NUXT_MEDIA_BUCKET: 'nimeplay',
        },
      },
    },
    openAPI: {
      meta: {
        title: 'Nimeplay API',
        version: '1.0.0',
      },
      route: '/_openapi.json',
      production: 'runtime',
      ui: {
        scalar: false,
        swagger: { route: '/_swagger' },
      },
    },
  },
  imports: {
    dirs: ['composables/**'],
  },
  routeRules: {
    '/': { swr: 120 },
    '/anime/:malId': { swr: 300 },
    '/media/**': { swr: 86400 },
    '/api/**': { cors: { ...apiCors } },
    '/api/stream': { headers: { 'cache-control': 'no-store' } },
    '/api/v1/anime': { cache: { maxAge: 60, swr: true, allowQuery: ['type', 'page', 'q'] } },
    '/api/v1/anime/:malId': { swr: 60 },
    '/api/v1/genres': { swr: 3600 },
    '/api/v1/genre/**': { cache: { maxAge: 300, swr: true, allowQuery: ['page'] } },
    '/openapi.json': { cors: { ...apiCors } },
    '/docs': { cors: { ...apiCors }, headers: { 'content-type': 'text/html; charset=utf-8' } },
  },
  experimental: {
    buildCache: true,
    prefetchPreloadTags: true,
  },
  modules: ['@nuxtjs/device'],
  hooks: {
    'build:manifest': manifest => {
      for (const [id, chunk] of Object.entries(manifest)) {
        if (id.includes('hls.js')) (chunk as { prefetch?: boolean }).prefetch = false
      }
    },
    'prepare:types': ({ tsConfig }) => {
      if (!tsConfig.compilerOptions) tsConfig.compilerOptions = {}
      const compilerOptions = tsConfig.compilerOptions
      compilerOptions.lib = ['ESNext', 'DOM', 'DOM.Iterable']
    },
  },
  sourcemap: { server: false, client: false },
  css: [
    '@fontsource/geist-sans/latin-400.css',
    '@fontsource/geist-sans/latin-500.css',
    '@fontsource/geist-sans/latin-600.css',
    '@fontsource/geist-sans/latin-700.css',
    '@fontsource/geist-mono/latin-400.css',
    '~/assets/css/main.css',
  ],
  app: {
    head: {
      htmlAttrs: { lang: 'id', class: 'h-full antialiased notranslate', translate: 'no' },
      bodyAttrs: { class: 'min-h-full' },
      title: 'Nimeplay',
      titleTemplate: '%s - Nimeplay',
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
      meta: [
        { name: 'description', content: 'Minimal anime streaming' },
        { name: 'google', content: 'notranslate' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
