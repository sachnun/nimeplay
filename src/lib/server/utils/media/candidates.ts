import { selectDefaultCandidate } from './prepare'

export interface EpisodeCandidate {
  dataContent: string
  quality: string
  name: string
}

export function orderCandidates(
  candidates: EpisodeCandidate[],
  mirrors: Parameters<typeof selectDefaultCandidate>[0],
  preferredServer: string,
  preferredQuality: string,
): EpisodeCandidate[] {
  const requested =
    preferredServer || preferredQuality
      ? candidates.find(
          candidate =>
            (!preferredServer || candidate.name.toLowerCase() === preferredServer) &&
            (!preferredQuality || candidate.quality === preferredQuality),
        )
      : undefined
  if (requested) return [requested]
  const best = selectDefaultCandidate(mirrors)
  const match = best && candidates.find(candidate => candidate.dataContent === best.dataContent)
  if (!match) return candidates
  return [match, ...candidates.filter(candidate => candidate.dataContent !== match.dataContent)]
}
