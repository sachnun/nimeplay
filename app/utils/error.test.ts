import { describe, expect, test } from 'bun:test'
import { isServerError } from './error'

describe('isServerError', () => {
  test('is false for falsy values', () => {
    expect(isServerError(undefined)).toBe(false)
    expect(isServerError(null)).toBe(false)
    expect(isServerError(0)).toBe(false)
    expect(isServerError('')).toBe(false)
  })

  test('treats 5xx status codes as server errors', () => {
    expect(isServerError({ statusCode: 500 })).toBe(true)
    expect(isServerError({ statusCode: 503 })).toBe(true)
    expect(isServerError({ status: 502 })).toBe(true)
  })

  test('treats 4xx status codes as client errors', () => {
    expect(isServerError({ statusCode: 404 })).toBe(false)
    expect(isServerError({ status: 400 })).toBe(false)
  })

  test('defaults to a server error when no status is present', () => {
    expect(isServerError({})).toBe(true)
    expect(isServerError(new Error('boom'))).toBe(true)
  })

  test('prefers statusCode over status', () => {
    expect(isServerError({ statusCode: 404, status: 500 })).toBe(false)
  })

  test('ignores non numeric status values', () => {
    expect(isServerError({ statusCode: '500' })).toBe(true)
  })
})
