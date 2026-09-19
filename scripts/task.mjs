import { runTask } from 'nitropack/core'
import { resolve } from 'node:path'

const name = process.argv[2]
if (!name) {
  console.error('usage: node scripts/task.mjs <name>')
  process.exit(1)
}

try {
  const { result } = await runTask(
    { name, context: {}, payload: {} },
    { cwd: resolve('.'), buildDir: '.nuxt' },
  )
  console.log(result)
}
catch (error) {
  console.error(`Failed to run task "${name}":`, error instanceof Error ? error.message : error)
  process.exit(1)
}
