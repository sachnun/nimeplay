type HlsModule = typeof import('hls.js/light')

let hlsPromise: Promise<HlsModule> | null = null

export function preloadHls() {
  if (!import.meta.client || hlsPromise) return hlsPromise
  hlsPromise = import('hls.js/light').catch((error) => {
    hlsPromise = null
    throw error
  })
  return hlsPromise
}

export function loadHls(): Promise<HlsModule> {
  if (hlsPromise) return hlsPromise
  if (!import.meta.client) return import('hls.js/light')
  return preloadHls() as Promise<HlsModule>
}
