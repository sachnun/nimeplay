const SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

const CONSTANTS = (() => {
  const table = new Uint32Array(64)
  for (let i = 0; i < 64; i++) table[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0
  return table
})()

export function md5Hex(input: Uint8Array): string {
  const length = input.length
  const padded = new Uint8Array((((length + 8) >> 6) + 1) << 6)
  padded.set(input)
  padded[length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, (length * 8) >>> 0, true)
  view.setUint32(padded.length - 4, Math.floor(length / 536870912), true)

  let a0 = 0x67452301
  let b0 = 0xefcdab89
  let c0 = 0x98badcfe
  let d0 = 0x10325476
  const words = new Uint32Array(16)

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i++) words[i] = view.getUint32(offset + i * 4, true)
    let a = a0
    let b = b0
    let c = c0
    let d = d0
    for (let i = 0; i < 64; i++) {
      let f: number
      let g: number
      if (i < 16) {
        f = (b & c) | (~b & d)
        g = i
      }
      else if (i < 32) {
        f = (d & b) | (~d & c)
        g = (5 * i + 1) % 16
      }
      else if (i < 48) {
        f = b ^ c ^ d
        g = (3 * i + 5) % 16
      }
      else {
        f = c ^ (b | ~d)
        g = (7 * i) % 16
      }
      f = (f + a + CONSTANTS[i]! + words[g]!) >>> 0
      a = d
      d = c
      c = b
      const shift = SHIFTS[i]!
      b = (b + ((f << shift) | (f >>> (32 - shift)))) >>> 0
    }
    a0 = (a0 + a) >>> 0
    b0 = (b0 + b) >>> 0
    c0 = (c0 + c) >>> 0
    d0 = (d0 + d) >>> 0
  }

  const digest = new Uint8Array(16)
  const digestView = new DataView(digest.buffer)
  digestView.setUint32(0, a0, true)
  digestView.setUint32(4, b0, true)
  digestView.setUint32(8, c0, true)
  digestView.setUint32(12, d0, true)
  let hex = ''
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0')
  return hex
}
