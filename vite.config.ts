import adapter from '@sveltejs/adapter-cloudflare'
import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      adapter: adapter(),
      compilerOptions: {
        runes: true,
      },
    }),
  ],
  build: {
    // hls.js is heavy and only needed on the player route
    rollupOptions: {
      output: {
        manualChunks: id => (id.includes('hls.js') ? 'hls' : undefined),
      },
    },
  },
})
