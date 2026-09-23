import type { NeonHttpDatabase } from 'drizzle-orm/neon-http'
import * as schema from '../../database/schema'

export type Database = NeonHttpDatabase<typeof schema>

let factory: (() => Database) | undefined
let node: Database | undefined
let http: Database | undefined

export function setNodeDatabase(database: unknown): void {
  node = database as Database
}

export function setDatabaseFactory(create: () => Database): void {
  factory = create
}

export function db(): Database {
  if (node) return node
  if (http) return http
  if (!factory) throw new Error('database driver is not configured')
  http = factory()
  return http
}
