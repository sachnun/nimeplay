export default defineEventHandler((event) => {
  const context = event.context as unknown as { cloudflare?: { env?: Record<string, unknown> } }
  const bindings = context.cloudflare?.env
  if (!bindings) return
  const holder = globalThis as unknown as { __bindings__?: Record<string, unknown> }
  holder.__bindings__ = { ...holder.__bindings__, ...bindings }
})
