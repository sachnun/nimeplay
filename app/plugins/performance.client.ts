export default defineNuxtPlugin(() => {
  const runIdle = (callback: () => void, timeout = 1500) => {
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(callback, { timeout })
      return () => window.cancelIdleCallback(id)
    }

    const id = globalThis.setTimeout(callback, Math.min(timeout, 300))
    return () => globalThis.clearTimeout(id)
  }

  return {
    provide: { runIdle },
  }
})
