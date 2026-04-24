import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      htmlAttrs: { lang: 'id', class: 'h-full antialiased' },
      bodyAttrs: { class: 'min-h-full' },
      title: 'Nimeplay',
      titleTemplate: (title) => title && title !== 'Nimeplay' ? `${title} - Nimeplay` : 'Nimeplay',
      meta: [
        { name: 'description', content: 'Minimal anime streaming' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }
      ]
    }
  },
  vite: {
    optimizeDeps: {
      include: ['hls.js']
    },
    plugins: [tailwindcss()]
  }
})
