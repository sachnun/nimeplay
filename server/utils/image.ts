import decodeJpeg, { init as initJpegDecode } from '@jsquash/jpeg/decode'
import decodePng, { init as initPngDecode } from '@jsquash/png/decode'
import encodeWebp, { init as initWebpEncode } from '@jsquash/webp/encode'
import { jpegDecWasm, pngDecWasm, webpEncWasm } from './wasm-binary'

const WEBP_QUALITY = 82

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

let ready: Promise<void> | undefined

function ensureWasm(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const [webpEnc, jpegDec, pngDec] = await Promise.all([
        WebAssembly.compile(decodeBase64(webpEncWasm)),
        WebAssembly.compile(decodeBase64(jpegDecWasm)),
        WebAssembly.compile(decodeBase64(pngDecWasm)),
      ])
      await Promise.all([
        initWebpEncode(webpEnc),
        initJpegDecode(jpegDec),
        initPngDecode(pngDec),
      ])
    })().catch((error) => {
      ready = undefined
      throw error
    })
  }
  return ready
}

export interface OptimizedImage {
  bytes: ArrayBuffer
  contentType: string
}

function detectFormat(bytes: ArrayBuffer): 'jpeg' | 'png' | 'gif' | 'webp' | null {
  if (bytes.byteLength < 12) return null
  const b = new Uint8Array(bytes, 0, 12)
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}

export async function toWebp(bytes: ArrayBuffer, contentType: string): Promise<OptimizedImage> {
  const format = detectFormat(bytes) ?? (/jpe?g/i.test(contentType) ? 'jpeg' : /png/i.test(contentType) ? 'png' : null)
  if (format !== 'jpeg' && format !== 'png') return { bytes, contentType }
  try {
    await ensureWasm()
    const image = format === 'jpeg' ? await decodeJpeg(bytes) : await decodePng(bytes)
    const output = await encodeWebp(image, { quality: WEBP_QUALITY })
    if (output.byteLength === 0 || output.byteLength >= bytes.byteLength) return { bytes, contentType }
    return { bytes: output, contentType: 'image/webp' }
  }
  catch {
    return { bytes, contentType }
  }
}
