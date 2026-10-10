import { envValue } from '../env'

interface MediaConfig {
  accessKeyId: string
  secretAccessKey: string
  endpoint: string
  region: string
  bucket: string
}

function value(name: string, fallback = ''): string {
  const env = envValue(name)
  return env.length > 0 ? env : fallback
}

export function mediaConfig(): MediaConfig {
  return {
    accessKeyId: value('AWS_ACCESS_KEY_ID'),
    secretAccessKey: value('AWS_SECRET_ACCESS_KEY'),
    endpoint: value('AWS_ENDPOINT_URL_S3'),
    region: value('AWS_REGION', 'us-east-1'),
    bucket: value('MEDIA_BUCKET', 'nimeplay'),
  }
}

export function readStreamSecret(): string {
  return value('STREAM_SECRET')
}
