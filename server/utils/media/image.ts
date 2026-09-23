import { Buffer } from 'node:buffer'
import sharp from 'sharp'

const WEBP_QUALITY = 78

export interface OptimizedImage {
  bytes: ArrayBuffer
  contentType: string
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer
}

export async function optimizeImage(bytes: ArrayBuffer, contentType: string, maxSize: number, square = false): Promise<OptimizedImage> {
  try {
    const image = sharp(Buffer.from(bytes), { animated: false })
    const meta = await image.metadata()
    const width = meta.width ?? 0
    const height = meta.height ?? 0
    if (!meta.format || meta.format === 'gif') return { bytes, contentType }

    let pipeline = image
    if (square && width && height) {
      const size = Math.min(width, height)
      if (width !== size || height !== size) {
        pipeline = pipeline.extract({
          left: Math.floor((width - size) / 2),
          top: Math.floor((height - size) / 2),
          width: size,
          height: size,
        })
      }
      if (size > maxSize) pipeline = pipeline.resize(maxSize, maxSize)
    }
    else if (width > maxSize) {
      pipeline = pipeline.resize({ width: maxSize })
    }

    const output = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer()
    if (output.byteLength === 0 || output.byteLength >= bytes.byteLength) return { bytes, contentType }
    return { bytes: toArrayBuffer(output), contentType: 'image/webp' }
  }
  catch {
    return { bytes, contentType }
  }
}
