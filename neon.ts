import { defineConfig } from '@neon/config/v1'

export default defineConfig({
  functions: {
    task: {
      name: 'Nimeplay Tasks',
      source: './functions/task.ts',
      externalPackages: ['impit'],
      env: {
        MEDIA_BUCKET: process.env.MEDIA_BUCKET ?? 'nimeplay',
      },
    },
    media: {
      name: 'Nimeplay Media',
      source: './functions/media.ts',
      externalPackages: ['sharp'],
      env: {
        MEDIA_BUCKET: process.env.MEDIA_BUCKET ?? 'nimeplay',
      },
    },
  },
  triggers: {
    tick: { type: 'schedule', function: 'task', cron: '0 */2 * * *', functionPath: '/tick' },
    catalog: { type: 'schedule', function: 'task', cron: '0 */6 * * *', functionPath: '/catalog' },
    media: { type: 'schedule', function: 'media', cron: '0 */2 * * *', functionPath: '/tick' },
  },
})
