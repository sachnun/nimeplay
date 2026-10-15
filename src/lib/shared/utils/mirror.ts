const SOURCE_PRIORITY_GROUPS = [
  ['animeverse', 'nekoclouds'],
  ['puterin', 'putarin'],
  ['pixeldrain', 'pdrain', 'odcdn', 'odstream', 'odcloud', 'arcg', 'archive'],
  ['vidhide', 'filelions'],
  ['ondesuhd', 'desudesuhd', 'otakustream', 'moedesuhd', 'ondesu', 'updesu', 'desustream', 'otakuwatch'],
  ['desudrive'],
  ['moeplay', 'yourupload', 'yuplod', 'mp4upload', 'mp4load'],
  ['mega', 'blogs'],
  ['filedon'],
]

const QUALITY_ORDER = ['1080p', '720p', '480p', '360p']

export function sourcePriority(name: string): number {
  const normalized = name.toLowerCase().trim()
  const groupIndex = SOURCE_PRIORITY_GROUPS.findIndex(group => group.some(source => normalized.includes(source)))
  return groupIndex === -1 ? SOURCE_PRIORITY_GROUPS.length : groupIndex
}

export function qualityRank(quality: string): number {
  const index = QUALITY_ORDER.indexOf(quality)
  return index === -1 ? 99 : index
}

export function qualityScore(quality: string): number {
  const index = QUALITY_ORDER.indexOf(quality)
  if (index === -1) return 0
  return 1 - index / (QUALITY_ORDER.length - 1)
}

export function sourcePriorityScore(name: string): number {
  const rank = sourcePriority(name)
  const last = SOURCE_PRIORITY_GROUPS.length
  return 1 - Math.min(rank, last) / last
}

export function mirrorPriorityScore(candidate: { server: string; quality?: string }): number {
  const source = sourcePriorityScore(candidate.server)
  if (!candidate.quality) return source
  return source * 0.75 + qualityScore(candidate.quality) * 0.25
}
