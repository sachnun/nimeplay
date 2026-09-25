import { RPCSerializer } from '@orpc/client'

const KEY = new TextEncoder().encode('nimeplay-rpc-v1')

function xor(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i] as number) ^ (KEY[i % KEY.length] as number)
  return out
}

function encode(text: string): string {
  let hex = ''
  for (const byte of xor(new TextEncoder().encode(text))) hex += byte.toString(16).padStart(2, '0')
  return hex
}

function decode(hex: string): string {
  const bytes = new Uint8Array(hex.length >> 1)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return new TextDecoder().decode(xor(bytes))
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype
}

function obfuscate(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(obfuscate)
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) out[encode(key)] = obfuscate(val)
    return out
  }
  return encode(JSON.stringify(value))
}

function reveal(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reveal)
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value)) out[decode(key)] = reveal(val)
    return out
  }
  return JSON.parse(decode(value as string))
}

class ObfuscatedSerializer extends RPCSerializer {
  override serialize(data: unknown, options?: Parameters<RPCSerializer['serialize']>[1]) {
    const body = super.serialize(data, options)
    if (!isPlainObject(body)) return body
    return obfuscate(JSON.parse(JSON.stringify(body)))
  }

  override deserialize(body: unknown) {
    if (!isPlainObject(body)) return super.deserialize(body)
    return super.deserialize(reveal(body))
  }
}

export const obfuscatedSerializer = new ObfuscatedSerializer()
