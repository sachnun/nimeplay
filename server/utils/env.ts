type EnvMap = Record<string, unknown>

export function cloudflareEnv(): EnvMap {
  const holder = globalThis as unknown as { __bindings__?: EnvMap }
  return holder.__bindings__ ?? {}
}
