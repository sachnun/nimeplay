import decodeJpeg, { init as initJpegDecode } from '@jsquash/jpeg/decode'
import jpegDecWasm from '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?module'
import decodePng, { init as initPngDecode } from '@jsquash/png/decode'
import pngDecWasm from '@jsquash/png/codec/pkg/squoosh_png_bg.wasm?module'
import resize, { initResize } from '@jsquash/resize'
import resizeWasm from '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?module'
import decodeWebp, { init as initWebpDecode } from '@jsquash/webp/decode'
import webpDecWasm from '@jsquash/webp/codec/dec/webp_dec.wasm?module'
import encodeWebp, { init as initWebpEncode } from '@jsquash/webp/encode'
import webpEncWasm from '@jsquash/webp/codec/enc/webp_enc_simd.wasm?module'

const WEBP_QUALITY = 78

let ready: Promise<void> | undefined

function ensureWasm(): Promise<void> {
  if (!ready) {
    ready = Promise.all([
      initWebpEncode(webpEncWasm),
      initWebpDecode(webpDecWasm),
      initJpegDecode(jpegDecWasm),
      initPngDecode(pngDecWasm),
      initResize(resizeWasm),
    ]).then(() => {}).catch((error) => {
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

type Format = 'jpeg' | 'png' | 'gif' | 'webp'

function detectFormat(bytes: ArrayBuffer): Format | null {
  if (bytes.byteLength < 12) return null
  const b = new Uint8Array(bytes, 0, 12)
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}

function formatOf(bytes: ArrayBuffer, contentType: string): Format | null {
  const detected = detectFormat(bytes)
  if (detected) return detected
  if (/webp/i.test(contentType)) return 'webp'
  if (/jpe?g/i.test(contentType)) return 'jpeg'
  if (/png/i.test(contentType)) return 'png'
  return null
}

async function decodeImage(bytes: ArrayBuffer, format: Format) {
  if (format === 'jpeg') return decodeJpeg(bytes)
  if (format === 'png') return decodePng(bytes)
  return decodeWebp(bytes)
}

function centerSquare(image: ImageData) {
  const size = Math.min(image.width, image.height)
  if (image.width === size && image.height === size) return image
  const sx = Math.floor((image.width - size) / 2)
  const sy = Math.floor((image.height - size) / 2)
  const data = new Uint8ClampedArray(size * size * 4)
  for (let y = 0; y < size; y++) {
    const start = ((y + sy) * image.width + sx) * 4
    data.set(image.data.subarray(start, start + size * 4), y * size * 4)
  }
  return { data, width: size, height: size } as unknown as ImageData
}

export async function optimizeImage(bytes: ArrayBuffer, contentType: string, maxSize: number, square = false): Promise<OptimizedImage> {
  const format = formatOf(bytes, contentType)
  if (!format || format === 'gif') return { bytes, contentType }
  try {
    await ensureWasm()
    let image = await decodeImage(bytes, format)
    if (square) {
      image = centerSquare(image)
      if (image.width > maxSize) image = await resize(image, { width: maxSize, height: maxSize })
    }
    else if (image.width > maxSize) {
      const height = Math.max(1, Math.round((image.height * maxSize) / image.width))
      image = await resize(image, { width: maxSize, height })
    }
    const output = await encodeWebp(image, { quality: WEBP_QUALITY })
    if (output.byteLength === 0 || output.byteLength >= bytes.byteLength) return { bytes, contentType }
    return { bytes: output, contentType: 'image/webp' }
  }
  catch {
    return { bytes, contentType }
  }
}
