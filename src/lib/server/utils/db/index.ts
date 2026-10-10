import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import type * as schema from '../../database/schema'

type Database = NeonHttpDatabase<typeof schema>

interface DbState {
  factory?: () => Database
  node?: Database
  http?: Database
}

const global = globalThis as unknown as { nimeplayDbState?: DbState }
global.nimeplayDbState ??= {}
const state = global.nimeplayDbState

export function setNodeDatabase(database: unknown): void {
  state.node = database as Database
}

export function setDatabaseFactory(create: () => Database): void {
  state.factory = create
}

export function db(): Database {
  if (state.node) return state.node
  if (!state.http) {
    if (!state.factory) throw new Error('database driver is not configured')
    state.http = state.factory()
  }
  return state.http
}

export function resultRows<T>(result: unknown): T[] {
  return (Array.isArray(result) ? result : ((result as { rows?: T[] }).rows ?? [])) as T[]
}
