type Fields = Record<string, unknown>

export type Level = 'info' | 'ok' | 'warn' | 'error'

const VERBOSE = process.env.LOG_VERBOSE !== '0'
const ACTIONS = process.env.GITHUB_ACTIONS === 'true'
const COLOR = ACTIONS || Boolean(process.stdout.isTTY)

export const CODES: Record<Level, number> = { info: 36, ok: 32, warn: 33, error: 31 }

export function emit(level: Level, message: string, fields?: Fields): void {
  if (!VERBOSE && level === 'info') return
  const line = fields ? `${message} ${JSON.stringify(fields)}` : message
  const text = COLOR ? `\u001b[${CODES[level]}m${line}\u001b[0m` : line
  if (level === 'error') console.error(text)
  else console.log(text)
}

export function log(message: string, fields?: Fields): void {
  emit('info', message, fields)
}

export function ok(message: string, fields?: Fields): void {
  emit('ok', message, fields)
}

export function warn(message: string, fields?: Fields): void {
  emit('warn', message, fields)
}

export function error(message: string, fields?: Fields): void {
  emit('error', message, fields)
}
