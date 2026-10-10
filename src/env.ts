import { defineEnvVars } from '@sveltejs/kit/env'

export const variables = defineEnvVars({
  DATABASE_URL: {
    description: 'Neon Postgres connection string',
    schema: value => value,
  },
  STREAM_SECRET: {
    description: 'Key material used to sign stream tokens, at least 32 characters',
    schema: value => {
      if (value && value.length < 32) throw new Error('STREAM_SECRET must be at least 32 characters')
      return value
    },
  },
  MEDIA_BUCKET: {
    description: 'Object storage bucket that caches posters and character art',
    schema: value => value ?? 'nimeplay',
  },
  AWS_ACCESS_KEY_ID: {
    description: 'Access key for the S3 compatible media store',
    schema: value => value ?? '',
  },
  AWS_SECRET_ACCESS_KEY: {
    description: 'Secret key for the S3 compatible media store',
    schema: value => value ?? '',
  },
  AWS_ENDPOINT_URL_S3: {
    description: 'Endpoint of the S3 compatible media store',
    schema: value => value ?? '',
  },
  AWS_REGION: {
    description: 'Region of the S3 compatible media store',
    schema: value => value ?? 'us-east-1',
  },
})
