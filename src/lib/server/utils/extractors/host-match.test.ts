import { describe, expect, test } from 'bun:test'
import { isNekoclouds } from './nekoclouds'
import { isOdcloud } from './odcloud'
import { isPuterin } from './puterin'
import { isVidhide } from './vidhide'

describe('host matching', () => {
  test('matches odcloud embeds', () => {
    expect(isOdcloud('https://odcloud.net/dstream/abc')).toBe(true)
    expect(isOdcloud('https://cdn.example/dstream/odcdn/1')).toBe(true)
    expect(isOdcloud('https://example.com/')).toBe(false)
  })

  test('matches vidhide embeds', () => {
    expect(isVidhide('https://vidhide.com/e/abc')).toBe(true)
    expect(isVidhide('https://odvidhide.pro/e/abc')).toBe(true)
    expect(isVidhide('https://example.com/e/abc')).toBe(false)
  })

  test('matches nekoclouds embeds', () => {
    expect(isNekoclouds('https://nekoclouds.com/embed/abc')).toBe(true)
    expect(isNekoclouds('https://example.com/embed/abc')).toBe(false)
  })

  test('matches puterin by hostname suffix only', () => {
    expect(isPuterin('https://puterin.biz/e/abc')).toBe(true)
    expect(isPuterin('https://cdn.putarin.biz/e/abc')).toBe(true)
    expect(isPuterin('https://puterin.biz.evil.example/e/abc')).toBe(false)
    expect(isPuterin('not a url')).toBe(false)
  })
})
