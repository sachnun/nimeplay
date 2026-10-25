import { describe, expect, test } from 'bun:test'
import { mediaConfig, readStreamSecret } from './config'

describe('mediaConfig', () => {
  test('falls back to defaults for optional values', () => {
    const config = mediaConfig()
    expect(config.region.length).toBeGreaterThan(0)
    expect(config.bucket.length).toBeGreaterThan(0)
  })

  test('reads values from the environment', () => {
    process.env.AWS_ACCESS_KEY_ID = 'key'
    process.env.AWS_SECRET_ACCESS_KEY = 'secret'
    process.env.AWS_ENDPOINT_URL_S3 = 'https://s3.example'
    process.env.AWS_REGION = 'ap-southeast-1'
    process.env.MEDIA_BUCKET = 'bucket'
    try {
      expect(mediaConfig()).toEqual({
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        endpoint: 'https://s3.example',
        region: 'ap-southeast-1',
        bucket: 'bucket',
      })
    } finally {
      delete process.env.AWS_ACCESS_KEY_ID
      delete process.env.AWS_SECRET_ACCESS_KEY
      delete process.env.AWS_ENDPOINT_URL_S3
      delete process.env.AWS_REGION
      delete process.env.MEDIA_BUCKET
    }
  })
})

describe('readStreamSecret', () => {
  test('reads the stream secret', () => {
    process.env.STREAM_SECRET = 'secret-value'
    try {
      expect(readStreamSecret()).toBe('secret-value')
    } finally {
      delete process.env.STREAM_SECRET
    }
  })
})
