const WEBP_QUALITY = 78

interface OptimizedImage {
  bytes: ArrayBuffer
  contentType: string
}

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer
}

export async function optimizeImage(bytes: ArrayBuffer, contentType: string, maxSize: number): Promise<OptimizedImage> {
  try {
    const image = new Bun.Image(bytes)
    const { width, format } = await image.metadata()
    if (!format || format === 'gif') return { bytes, contentType }
    if (width > maxSize) image.resize(maxSize)
    const output = await image.webp({ quality: WEBP_QUALITY }).bytes()
    if (output.byteLength === 0 || output.byteLength >= bytes.byteLength) return { bytes, contentType }
    return { bytes: toArrayBuffer(output), contentType: 'image/webp' }
  }
  catch {
    return { bytes, contentType }
  }
}
