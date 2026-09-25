import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from '../../database/schema'

export type Database = NeonHttpDatabase<typeof schema>

interface DbState {
  factory?: () => Database
  node?: Database
  http?: Database
}

const holder = globalThis as unknown as { __db_state__?: DbState }
const state = (holder.__db_state__ ??= {})

export function setNodeDatabase(database: unknown): void {
  state.node = database as Database
}

export function setDatabaseFactory(create: () => Database): void {
  state.factory = create
}

export function db(): Database {
  if (state.node) return state.node
  if (state.http) return state.http
  if (!state.factory) throw new Error('database driver is not configured')
  state.http = state.factory()
  return state.http
}
