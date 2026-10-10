type HlsModule = typeof import('hls.js/light')

let hlsPromise: Promise<HlsModule> | null = null

function isBrowser(): boolean {
  return typeof window !== 'undefined'
}

export function preloadHls(): Promise<HlsModule> | undefined {
  if (!isBrowser() || hlsPromise) return hlsPromise ?? undefined
  hlsPromise = import('hls.js/light').catch(error => {
    hlsPromise = null
    throw error
  })
  return hlsPromise
}

export function loadHls(): Promise<HlsModule> {
  if (hlsPromise) return hlsPromise
  if (!isBrowser()) return import('hls.js/light')
  return preloadHls() as Promise<HlsModule>
}
