type HlsModule = typeof import('hls.js/light')

let hlsPromise: Promise<HlsModule> | null = null

export function loadHls(): Promise<HlsModule> {
  if (!hlsPromise) {
    hlsPromise = import('hls.js/light').catch(error => {
      hlsPromise = null
      throw error
    })
  }
  return hlsPromise
}
