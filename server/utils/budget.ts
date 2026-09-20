import { sql } from 'drizzle-orm'
import { db } from './db'
import { alert } from './alert'

const CAPACITY_S = 10 * 3600
const TARGET = 0.85
const BURST = 1.2
const DAYS = 30
const COLD_START_S = 0.25
const SHARES: Record<string, number> = { tick: 0.6, catalog: 0.2, media: 0.4 }

const LIMIT_S = CAPACITY_S * TARGET
const DAY_LIMIT_S = (LIMIT_S / DAYS) * BURST

function monthKey(): string {
  return `cpu:${new Date().toISOString().slice(0, 7)}`
}

function dayKey(): string {
  return `cpu:${new Date().toISOString().slice(0, 10)}`
}

function nameKey(name: string): string {
  return `${monthKey()}:${name}`
}

function nameLimitS(name: string): number {
  return LIMIT_S * (SHARES[name] ?? 1)
}

export function cpuMeter(): () => number {
  let prev = process.cpuUsage()
  return () => {
    const next = process.cpuUsage()
    const cpuS = (next.user - prev.user + next.system - prev.system) / 1e6
    prev = next
    return cpuS
  }
}

let coldStartS = COLD_START_S

function takeColdStartS(): number {
  const value = coldStartS
  coldStartS = 0
  return value
}

interface CpuState {
  totalS: number
  nameS: number
  dayS: number
}

function pick(rows: { key: string, value: string }[], key: string): number {
  return Number(rows.find(row => row.key === key)?.value ?? 0) || 0
}

async function read(name: string): Promise<CpuState> {
  const keys = [monthKey(), nameKey(name), dayKey()]
  const result = await db().execute(sql`
    select key, value from app_state
    where key in (${sql.join(keys.map(key => sql`${key}`), sql`, `)})
  `) as unknown as { rows: { key: string, value: string }[] }
  return {
    totalS: pick(result.rows, keys[0]!),
    nameS: pick(result.rows, keys[1]!),
    dayS: pick(result.rows, keys[2]!),
  }
}

async function add(name: string, cpuS: number): Promise<CpuState> {
  const keys = [monthKey(), nameKey(name), dayKey()]
  const value = String(cpuS)
  const result = await db().execute(sql`
    insert into app_state (key, value, updated_at)
    values (${keys[0]!}, ${value}, now()), (${keys[1]!}, ${value}, now()), (${keys[2]!}, ${value}, now())
    on conflict (key) do update
      set value = (app_state.value::numeric + excluded.value::numeric)::text, updated_at = now()
    returning key, value
  `) as unknown as { rows: { key: string, value: string }[] }
  return {
    totalS: pick(result.rows, keys[0]!),
    nameS: pick(result.rows, keys[1]!),
    dayS: pick(result.rows, keys[2]!),
  }
}

function within(name: string, state: CpuState): boolean {
  return state.totalS < LIMIT_S && state.nameS < nameLimitS(name) && state.dayS < DAY_LIMIT_S
}

export async function budgetOk(name: string): Promise<boolean> {
  return within(name, await read(name))
}

const round = (value: number): number => Math.round(value * 10) / 10

export interface CpuBudget {
  spend: () => Promise<boolean>
  report: () => Promise<void>
}

export function cpuBudget(name: string): CpuBudget {
  const sample = cpuMeter()
  let pending = takeColdStartS()
  return {
    spend: async () => {
      const cpuS = sample() + pending
      pending = 0
      if (cpuS <= 0) return true
      return within(name, await add(name, cpuS))
    },
    report: async () => {
      const state = await read(name)
      const pct = Math.round((state.totalS / LIMIT_S) * 1000) / 10
      console.log('[budget]', JSON.stringify({
        name,
        totalCpuS: round(state.totalS),
        limitCpuS: round(LIMIT_S),
        pct,
        dayCpuS: round(state.dayS),
        dayLimitS: round(DAY_LIMIT_S),
        nameCpuS: round(state.nameS),
      }))
      if (state.totalS >= LIMIT_S) await alert('budget:cpu', `function CPU budget reached (${pct}%)`, { totalCpuS: state.totalS, limitCpuS: LIMIT_S })
      else if (state.totalS >= LIMIT_S * 0.9) await alert('budget:cpu90', `function CPU budget at ${pct}%`, { totalCpuS: state.totalS })
      if (state.dayS >= DAY_LIMIT_S) await alert('budget:cpu-day', `function CPU daily budget reached`, { dayCpuS: state.dayS })
    },
  }
}
