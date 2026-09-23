function tokens(value: string): string[] {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
}

export function jaro(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1)
  const aMatch = new Array<boolean>(a.length).fill(false)
  const bMatch = new Array<boolean>(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - window)
    const end = Math.min(i + window + 1, b.length)
    for (let j = start; j < end; j++) {
      if (bMatch[j] || a[i] !== b[j]) continue
      aMatch[i] = true
      bMatch[j] = true
      matches++
      break
    }
  }
  if (matches === 0) return 0
  let transpositions = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aMatch[i]) continue
    while (!bMatch[k]) k++
    if (a[i] !== b[k]) transpositions++
    k++
  }
  transpositions /= 2
  return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3
}

export function jaroWinkler(a: string, b: string, prefixScale = 0.1, maxPrefix = 4): number {
  const base = jaro(a, b)
  if (base < 0.7) return base
  let prefix = 0
  const max = Math.min(maxPrefix, a.length, b.length)
  while (prefix < max && a[prefix] === b[prefix]) prefix++
  return base + prefix * prefixScale * (1 - base)
}

export function damerauLevenshtein(a: string, b: string): number {
  const rows = a.length + 1
  const cols = b.length + 1
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0))
  for (let i = 0; i < rows; i++) d[i]![0] = i
  for (let j = 0; j < cols; j++) d[0]![j] = j
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1)
      }
    }
  }
  return d[a.length]![b.length]!
}

export function normalizedDamerau(a: string, b: string): number {
  const longest = Math.max(a.length, b.length)
  if (longest === 0) return 1
  return 1 - damerauLevenshtein(a, b) / longest
}

export function tokenSetRatio(a: string, b: string): number {
  const aTokens = tokens(a)
  const bTokens = tokens(b)
  if (aTokens.length === 0 || bTokens.length === 0) return normalizedDamerau(a, b)
  const aSet = new Set(aTokens)
  const bSet = new Set(bTokens)
  const inter = [...aSet].filter(token => bSet.has(token)).sort()
  const aOnly = [...aSet].filter(token => !bSet.has(token)).sort()
  const bOnly = [...bSet].filter(token => !aSet.has(token)).sort()
  const t0 = inter.join(' ')
  const t1 = [...inter, ...aOnly].join(' ')
  const t2 = [...inter, ...bOnly].join(' ')
  return Math.max(normalizedDamerau(t0, t1), normalizedDamerau(t0, t2), normalizedDamerau(t1, t2))
}

function stripToAlnum(value: string): string {
  return value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')
}

export function titleSimilarity(a: string, b: string): number {
  const na = stripToAlnum(a)
  const nb = stripToAlnum(b)
  if (!na || !nb) return 0
  const charSim = Math.max(jaroWinkler(na, nb), normalizedDamerau(na, nb))
  return charSim * 0.75 + tokenSetRatio(a, b) * 0.25
}
