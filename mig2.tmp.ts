const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

const TOK = process.env.CLOUDFLARE_API_TOKEN!
const P = '13e8f6d8fb7367570ada75fa71e1999d'
const S = '94c239b1000339fbb2ae2e144c5bfa1e'

const API = (acc: string, path: string) => `https://api.cloudflare.com/client/v4/accounts/${acc}/r2/buckets/nimeplay/objects${path}`
const enc = (key: string) => encodeURIComponent(key)

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let delay = 400
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const status = (error as { status?: number }).status
      if (status !== 429 && status !== 500 && status !== 502 && status !== 503 && status !== 504) throw error
      await sleep(delay)
      delay *= 2
    }
  }
  throw new Error('retries exhausted')
}

interface R2Object {
  key: string
  http_metadata?: { contentType?: string }
}

async function listAllKeys(account: string): Promise<R2Object[]> {
  const all: R2Object[] = []
  let cursor: string | null = null
  while (true) {
    await sleep(400)
    const url = API(account, `?per_page=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
    const data = await withRetry(async () => {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${TOK}` } })
      if (!res.ok) throw Object.assign(new Error(`list ${res.status}`), { status: res.status })
      return await res.json() as { result: R2Object[], result_info?: { cursor?: string, is_truncated?: boolean } }
    })
    all.push(...data.result)
    if (!data.result_info?.is_truncated || !data.result_info.cursor) break
    cursor = data.result_info.cursor
  }
  return all
}

async function copyObject(obj: R2Object): Promise<void> {
  const getRes = await withRetry(async () => {
    const res = await fetch(API(P, `/${enc(obj.key)}`), { headers: { Authorization: `Bearer ${TOK}` } })
    if (!res.ok) throw Object.assign(new Error(`get ${res.status}`), { status: res.status })
    return res
  })
  const bytes = await getRes.arrayBuffer()
  await withRetry(async () => {
    const res = await fetch(API(S, `/${enc(obj.key)}`), {
      method: 'PUT',
      headers: { Authorization: `Bearer ${TOK}`, 'Content-Type': obj.http_metadata?.contentType ?? 'application/octet-stream' },
      body: bytes,
    })
    if (!res.ok) throw Object.assign(new Error(`put ${res.status}`), { status: res.status })
  })
}

async function main() {
  console.log('listing Primary...')
  const source = await listAllKeys(P)
  console.log(`source: ${source.length}`)
  console.log('listing Secondary (skip existing)...')
  const existing = new Set((await listAllKeys(S)).map(o => o.key))
  const todo = source.filter(o => !existing.has(o.key))
  console.log(`to copy: ${todo.length}`)

  let ok = 0
  let fail = 0
  let index = 0
  const concurrency = 8
  const runners = Array.from({ length: concurrency }, async () => {
    while (index < todo.length) {
      await sleep(120)
      const obj = todo[index++]!
      try {
        await copyObject(obj)
        ok++
      } catch (error) {
        fail++
        console.log(`fail: ${obj.key} ${(error as Error).message}`)
      }
      if ((ok + fail) % 250 === 0) console.log(`progress ${ok + fail}/${todo.length} (ok=${ok} fail=${fail})`)
    }
  })
  await Promise.all(runners)
  console.log(`copy done: ok=${ok} fail=${fail}`)

  try {
    const secondary = await listAllKeys(S)
    console.log(`secondary total: ${secondary.length} (source ${source.length})`)
  } catch (error) {
    console.log('final verify list failed (rate limit), will re-verify later:', (error as Error).message)
  }
}

main().catch(e => { console.error(e); process.exit(1) })