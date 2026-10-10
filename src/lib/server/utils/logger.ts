import { Logger } from 'effect'
import { emit, type Level } from './log'

const LEVELS: Record<string, Level> = {
  all: 'info',
  trace: 'info',
  debug: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error',
  none: 'info',
}

function render(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return value.message
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export const ProjectLogger = Logger.make(({ message, logLevel }) => {
  const text = Array.isArray(message) ? message.map(render).join(' ') : render(message)
  emit(LEVELS[String(logLevel).toLowerCase()] ?? 'info', text)
})

export const LoggerLive = Logger.layer([ProjectLogger])
