import tailwindcss from '@tailwindcss/vite'
import type { NuxtConfig } from 'nuxt/schema'

export default defineNuxtConfig({
  ssr: true,
  compatibilityDate: '2025-07-15',
  devtools: { enabled: process.env.NODE_ENV === 'development' },
  nitro: {
    preset: 'cloudflare_module',
    experimental: {
      openAPI: true,
    },
    imports: {
      dirs: ['server/utils/**', 'server/types/**', 'shared/utils/**', 'shared/types/**'],
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
          MEDIA_BUCKET: 'nimeplay',
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
    dirs: ['composables/**', 'utils/**'],
  },
  modules: ['@nuxt/fonts', '@nuxtjs/device'],
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
  css: ['~/assets/css/main.css'],
  fonts: {
    families: [
      {
        name: 'Geist',
        provider: 'fontsource',
        weights: ['400', '500', '600', '700'],
        styles: ['normal'],
        subsets: ['latin'],
        global: true,
        preload: true,
      },
      {
        name: 'Geist Mono',
        provider: 'fontsource',
        weights: ['400'],
        styles: ['normal'],
        subsets: ['latin'],
        global: true,
        preload: false,
      },
    ],
  },
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
    plugins: [tailwindcss()] as NonNullable<NuxtConfig['vite']>['plugins'],
  },
})
