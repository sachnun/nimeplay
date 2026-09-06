import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const PRIMARY = '13e8f6d8fb7367570ada75fa71e1999d'
const SECONDARY = '94c239b1000339fbb2ae2e144c5bfa1e'

const keys = readFileSync('/tmp/r2keys.txt', 'utf8').split('\n').map(l => l.trim()).filter(Boolean)

let ok = 0
let fail = 0

function copy(key: string): void {
  execFileSync('npx', ['wrangler', 'r2', 'object', 'get', `nimeplay/${key}`, '--file', '/tmp/r2obj.bin', '--remote'], {
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: PRIMARY },
    stdio: 'pipe',
  })
  execFileSync('npx', ['wrangler', 'r2', 'object', 'put', `nimeplay/${key}`, '--file', '/tmp/r2obj.bin', '--remote'], {
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: SECONDARY },
    stdio: 'pipe',
  })
  ok++
}

async function main() {
  console.log(`copying ${keys.length} objects to Secondary...`)
  const concurrency = 6
  let index = 0
  const runners = Array.from({ length: concurrency }, async () => {
    while (index < keys.length) {
      const key = keys[index++]!
      try {
        copy(key)
      } catch {
        fail++
        console.log(`fail: ${key}`)
      }
      if (index % 40 === 0) console.log(`progress ${index}/${keys.length} (ok=${ok} fail=${fail})`)
    }
  })
  await Promise.all(runners)
  console.log(`done: ok=${ok} fail=${fail}`)
}

main().catch(e => { console.error(e); process.exit(1) })