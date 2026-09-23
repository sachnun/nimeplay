type Fields = Record<string, unknown>

const VERBOSE = process.env.LOG_VERBOSE !== '0'
const ACTIONS = process.env.GITHUB_ACTIONS === 'true'
const COLOR = ACTIONS || Boolean(process.stdout.isTTY)

const CODES = { info: 36, ok: 32, warn: 33, error: 31 } as const

function emit(level: keyof typeof CODES, message: string, fields?: Fields): void {
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
