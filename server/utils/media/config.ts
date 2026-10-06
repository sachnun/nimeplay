import { useRuntimeConfig } from 'nuxt/server'

interface MediaConfig {
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  region: string
  bucket: string
}

function value(runtimeKey: string, envName: string, fallback = ''): string {
  const runtime = (useRuntimeConfig() as Record<string, unknown>)[runtimeKey]
  if (typeof runtime === 'string' && runtime.length > 0) return runtime
  const env = process.env[envName]
  return env && env.length > 0 ? env : fallback
}

export function mediaConfig(): MediaConfig {
  return {
    accessKeyId: value('awsAccessKeyId', 'NUXT_AWS_ACCESS_KEY_ID'),
    secretAccessKey: value('awsSecretAccessKey', 'NUXT_AWS_SECRET_ACCESS_KEY'),
    endpoint: value('awsEndpointUrlS3', 'NUXT_AWS_ENDPOINT_URL_S3'),
    region: value('awsRegion', 'NUXT_AWS_REGION', 'us-east-1'),
    bucket: value('mediaBucket', 'NUXT_MEDIA_BUCKET', 'nimeplay'),
  }
}

export function readStreamSecret(): string {
  return value('streamSecret', 'NUXT_STREAM_SECRET')
}
