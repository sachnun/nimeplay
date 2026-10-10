type Env = Record<string, string | undefined>

const runtime: Env = {}

export function setRuntimeEnv(env: Env | undefined): void {
  if (!env) return
  for (const [key, value] of Object.entries(env)) if (typeof value === 'string') runtime[key] = value
}

export function envValue(name: string): string {
  const fromRuntime = runtime[name]
  if (fromRuntime && fromRuntime.length > 0) return fromRuntime
  const fromProcess = process.env[name]
  return fromProcess && fromProcess.length > 0 ? fromProcess : ''
}

export function requireEnv(name: string): string {
  const value = envValue(name)
  if (!value) throw new Error(`${name} is not set`)
  return value
}
