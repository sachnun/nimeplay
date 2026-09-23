const ROMAN_SEASONS: Record<string, number> = {
  ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9, x: 10, xi: 11, xii: 12,
}
const WORD_SEASONS: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
}
const JP_SEASONS: Record<string, number> = {
  ichi: 1, ni: 2, san: 3, yon: 4, shi: 4, go: 5, roku: 6, nana: 7, shichi: 7, hachi: 8, kyuu: 9, ku: 9, juu: 10,
}

export function seasonNumber(title: string): number | null {
  const lower = title.toLowerCase()
  const digit = /(?:(\d+)\s*(?:st|nd|rd|th)?\s*season)|(?:season\s*(\d+))|(?:\bpart\s*(\d+))|(?:\bs\s*(\d+)\b)/.exec(lower)
  if (digit) {
    for (const group of digit.slice(1)) {
      if (group !== undefined) return Number(group)
    }
  }
  const localized = /(?:temporada|saison|staffel|stagione|seizoen|sezona|sezon|сезон)\s*(\d+)/i.exec(lower)
  if (localized?.[1]) return Number(localized[1])
  const ordinal = /\b(\d+)(?:st|nd|rd|th)\b/.exec(lower)
  if (ordinal) return Number(ordinal[1])
  const trailingNumber = /\s(\d{1,2})$/.exec(lower.trim())
  if (trailingNumber) return Number(trailingNumber[1])
  const roman = /\b(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b/.exec(lower)
  if (roman?.[1] !== undefined && roman[1] in ROMAN_SEASONS) return ROMAN_SEASONS[roman[1]]!
  const word = /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/.exec(lower)
  if (word?.[1] !== undefined && word[1] in WORD_SEASONS) return WORD_SEASONS[word[1]]!
  const sono = /sono\s+(ichi|ni|san|yon|shi|go|roku|nana|shichi|hachi|kyuu|ku|juu)\b/.exec(lower)
  if (sono?.[1] !== undefined && sono[1] in JP_SEASONS) return JP_SEASONS[sono[1]]!
  const shou = /\b(ichi|ni|san|yon|shi|go|roku|nana|shichi|hachi|kyuu|ku|juu)\s+no\s+(shou|hen|ki|maku)\b/.exec(lower)
  if (shou?.[1] !== undefined && shou[1] in JP_SEASONS) return JP_SEASONS[shou[1]]!
  return null
}

export function malSearchVariants(title: string): string[] {
  const variants: string[] = []
  const push = (value: string) => {
    const cleaned = value.replace(/\s+/g, ' ').trim()
    if (cleaned && !variants.includes(cleaned)) variants.push(cleaned)
  }
  push(title)
  const seasonMatch = title.match(/(.+?)\s+Season\s+(\d+)\s*$/i)
  if (seasonMatch?.[1] && seasonMatch[2]) {
    const base = seasonMatch[1].trim()
    const num = Number(seasonMatch[2])
    const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']
    const romans = ['', '', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
    if (ordinals[num - 1]) push(`${base} ${ordinals[num - 1]}`)
    if (romans[num]) push(`${base} ${romans[num]}`)
    push(`${base} ${num}`)
  }
  const partMatch = title.match(/(.+?)\s+Part\s+(\d+)\s*$/i)
  if (partMatch?.[1] && partMatch[2]) {
    const base = partMatch[1].trim()
    const num = Number(partMatch[2])
    const romans = ['', '', 'II', 'III', 'IV', 'V', 'VI']
    if (romans[num]) push(`${base} ${romans[num]}`)
  }
  const stripped = title
    .replace(/\s+(?:season\s*\d+|\d+\s*(?:st|nd|rd|th)\s+season|s\d+)\s*$/i, '')
    .replace(/\s+part\s*\d+\s*$/i, '')
    .trim()
  if (stripped && stripped !== title) push(stripped)
  const plain = (stripped || title).normalize('NFKD').replace(/\p{Diacritic}/gu, '')
  if (plain !== (stripped || title)) push(plain)
  const words = title.split(/\s+/).filter(Boolean)
  for (let n = words.length - 1; n >= 3 && variants.length < 8; n--) {
    push(words.slice(0, n).join(' '))
  }
  return variants.slice(0, 8)
}
