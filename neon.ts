import { defineConfig } from '@neon/config/v1'

export default defineConfig({
  functions: {
    task: {
      name: 'Nimeplay Tasks',
      source: './functions/task.ts',
      externalPackages: ['sharp'],
      env: {
        MEDIA_BUCKET: process.env.MEDIA_BUCKET ?? 'nimeplay',
      },
    },
  },
  triggers: {
    tick: { type: 'schedule', function: 'task', cron: '* * * * *', functionPath: '/tick' },
    catalog: { type: 'schedule', function: 'task', cron: '*/30 * * * *', functionPath: '/catalog' },
  },
})
