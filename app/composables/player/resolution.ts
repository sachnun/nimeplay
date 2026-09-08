import type { Ref } from 'vue'
import type { EpisodeData } from '~/utils/types'
import type { MirrorCandidate } from '~/utils/player'

interface EpisodePlayerResolutionOptions {
  activeQuality: Ref<string>
  directUrl: Ref<string | null>
  directKind: Ref<'hls' | 'file' | null>
  episode: Ref<EpisodeData>
  loadingMessage: Ref<string>
  resolving: Ref<boolean>
}

type PrepareResult = {
  playUrl: string | null
  kind: 'hls' | 'file' | null
  ok: boolean
}

export function useEpisodePlayerResolution(options: EpisodePlayerResolutionOptions) {
  let fallbackFn: (() => void) | null = null
  let playbackSession = 0
  let fallbackRunning = false

  function triggerFallback() {
    fallbackFn?.()
  }

  function invalidatePlaybackSession() {
    playbackSession += 1
    fallbackFn = null
    fallbackRunning = false
  }

  function isCurrentSession(sessionId: number) {
    return sessionId === playbackSession
  }

  function activateDirectUrl(url: string | null | undefined, kind: 'hls' | 'file' | null) {
    if (!url) return false
    options.directUrl.value = url
    options.directKind.value = kind
    return true
  }

  function resultForCandidate(index: number, resolved: boolean) {
    return { resolved, nextIndex: index + 1 }
  }

  async function prepareCandidate(candidate: MirrorCandidate) {
    try {
      const prepared = await $fetch<PrepareResult>('/api/mirror/prepare', {
        method: 'POST',
        body: { dataContent: candidate.dataContent },
      })
      return { prepared }
    } catch {
      return null
    }
  }

  async function tryMirror(candidate: MirrorCandidate, sessionId: number): Promise<boolean> {
    if (!isCurrentSession(sessionId)) return false
    options.activeQuality.value = candidate.quality
    const result = await prepareCandidate(candidate)
    if (!result || !isCurrentSession(sessionId)) return false
    return activateDirectUrl(result.prepared?.playUrl, result.prepared?.kind ?? null)
  }

  async function resolveCandidateAt(candidates: MirrorCandidate[], index: number, sessionId: number) {
    if (!isCurrentSession(sessionId)) return { stop: true, resolved: false, nextIndex: index }
    options.loadingMessage.value = 'Mencoba sumber video lain...'
    const next = candidates[index]
    if (!next) return { stop: true, ...resultForCandidate(index, false) }
    const resolved = await tryMirror(next, sessionId)
    return { stop: !isCurrentSession(sessionId) || resolved, ...resultForCandidate(index, resolved) }
  }

  async function resolveCandidateList(candidates: MirrorCandidate[], startIndex: number, sessionId: number) {
    for (let index = startIndex; index < candidates.length; index++) {
      const result = await resolveCandidateAt(candidates, index, sessionId)
      if (result.stop) return { resolved: result.resolved, nextIndex: result.nextIndex }
    }
    return { resolved: false, nextIndex: candidates.length }
  }

  function resetForFallbackAttempt() {
    options.resolving.value = true
    options.loadingMessage.value = 'Mencoba sumber video lain...'
    options.directUrl.value = null
    options.directKind.value = null
  }

  function fallbackCandidates(startCandidate: MirrorCandidate, manual: boolean) {
    if (manual) return [startCandidate]
    return [
      startCandidate,
      ...buildFallbackOrder(options.episode.value.mirrors, startCandidate.quality, startCandidate.dataContent),
    ]
  }

  function startPlaybackResolution(seamless: boolean) {
    const sessionId = ++playbackSession
    fallbackRunning = false
    options.loadingMessage.value = seamless ? 'Mengganti kualitas...' : 'Menyiapkan player...'
    if (!seamless) {
      options.resolving.value = true
      options.directUrl.value = null
      options.directKind.value = null
    }
    return sessionId
  }

  async function resolveInitialPlayback(startCandidate: MirrorCandidate, candidates: MirrorCandidate[], fallbackIdx: number, sessionId: number) {
    const initialResolved = await tryMirror(startCandidate, sessionId)
    if (!isCurrentSession(sessionId) || initialResolved) return { resolved: initialResolved, nextIndex: fallbackIdx }
    const result = await resolveCandidateList(candidates, fallbackIdx, sessionId)
    return { resolved: result.resolved, nextIndex: result.nextIndex }
  }

  function finishPlaybackResolution(resolved: boolean, sessionId: number) {
    if (!isCurrentSession(sessionId)) return
    fallbackRunning = false
    options.resolving.value = false
  }

  function installFallbackHandler(candidates: MirrorCandidate[], sessionId: number, getFallbackIdx: () => number, setFallbackIdx: (index: number) => void) {
    fallbackFn = () => {
      if (fallbackRunning || !isCurrentSession(sessionId)) return
      fallbackRunning = true
      ;(async () => {
        try {
          resetForFallbackAttempt()
          const result = await resolveCandidateList(candidates, getFallbackIdx(), sessionId)
          setFallbackIdx(result.nextIndex)
          if (!isCurrentSession(sessionId)) return
          options.resolving.value = false
        } finally {
          if (isCurrentSession(sessionId)) fallbackRunning = false
        }
      })()
    }
  }

  async function playWithFallback(startCandidate: MirrorCandidate, manual: boolean, seamless = false) {
    const sessionId = startPlaybackResolution(seamless)
    const candidates = fallbackCandidates(startCandidate, manual)
    let fallbackIdx = 1
    installFallbackHandler(candidates, sessionId, () => fallbackIdx, (index) => { fallbackIdx = index })
    const result = await resolveInitialPlayback(startCandidate, candidates, fallbackIdx, sessionId)
    fallbackIdx = result.nextIndex
    finishPlaybackResolution(result.resolved, sessionId)
  }

  return {
    invalidatePlaybackSession,
    playWithFallback,
    triggerFallback,
  }
}
