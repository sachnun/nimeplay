type EnvMap = Record<string, unknown>

export function cloudflareEnv(): EnvMap {
  const holder = globalThis as unknown as { __bindings__?: EnvMap, __env__?: EnvMap }
  return { ...holder.__env__, ...holder.__bindings__ }
}
