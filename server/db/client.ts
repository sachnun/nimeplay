import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

const { Pool } = pg

let pool: pg.Pool | null = null

export function getDb() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')
  pool ||= new Pool({ connectionString })
  return drizzle(pool, { schema })
}

export type Db = ReturnType<typeof getDb>
