import type { Ref } from 'vue'
import type { EpisodeData, InitialStream } from '~/utils/types'
import type { MirrorCandidate } from '~/utils/player'

interface EpisodePlayerResolutionOptions {
  activeQuality: Ref<string>
  directUrl: Ref<string | null>
  directKind: Ref<'hls' | 'file' | null>
  episode: Ref<EpisodeData>
  iframeSrc: Ref<string | null>
  initialStream: Ref<InitialStream | null>
  loadingMessage: Ref<string>
  resolving: Ref<boolean>
  useIframe: Ref<boolean>
}

export function useEpisodePlayerResolution(options: EpisodePlayerResolutionOptions) {
  let fallbackFn: (() => void) | null = null
type PrepareResult = {
  iframeUrl: string | null
  playUrl: string | null
  kind: 'hls' | 'file' | null
  ok: boolean
}
  let playbackSession = 0
  let fallbackRunning = false
  const RACE_TIMEOUT_MS = 4000

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

  function activateIframe(url: string | null) {
    if (!url) return false
    options.iframeSrc.value = url
    options.directUrl.value = null
    options.directKind.value = null
    options.useIframe.value = true
    return true
  }

  function activateDirectUrl(url: string | null | undefined, kind: 'hls' | 'file' | null) {
    if (!url) return false
    options.useIframe.value = false
    options.directUrl.value = url
    options.directKind.value = kind
    return true
  }

  function canUseIframeFallback(iframeUrl: string) {
    return iframeUrl.includes('desustream.info')
  }

  function activateDefaultIframe() {
    return activateIframe(options.iframeSrc.value || options.episode.value.defaultIframeSrc)
  }

  function canUsePreparedMirror(sessionId: number, iframeUrl: string | null | undefined) {
    return isCurrentSession(sessionId) && Boolean(iframeUrl)
  }

  function resultForCandidate(index: number, resolved: boolean) {
    return { resolved, nextIndex: index + 1 }
  }

  function activateExtractedMirror(iframeUrl: string, prepared: { ok?: boolean; playUrl?: string | null; kind?: 'hls' | 'file' | null }) {
    if (activateDirectUrl(prepared.playUrl, prepared.kind ?? null)) return true
    return canUseIframeFallback(iframeUrl) && activateIframe(iframeUrl)
  }

  function activatePreparedMirror(iframeUrl: string, prepared: PrepareResult, shouldExtract: boolean) {
    options.iframeSrc.value = iframeUrl
    if (!shouldExtract) return prepared.ok === true && activateIframe(iframeUrl)
    return activateExtractedMirror(iframeUrl, prepared)
  }

  function tryInitialStream(candidate: MirrorCandidate, sessionId: number): boolean {
    const initial = options.initialStream.value
    if (!initial || !initial.ok || !initial.playUrl) return false
    if (!isCurrentSession(sessionId)) return false
    if (initial.dataContent !== candidate.dataContent) return false
    options.activeQuality.value = initial.quality || candidate.quality
    options.iframeSrc.value = initial.iframeUrl
    return activateDirectUrl(initial.playUrl, initial.kind ?? null)
  }

  async function prepareCandidate(candidate: MirrorCandidate) {
    try {
      const shouldExtract = isExtractable(candidate.name)
      const prepared = await $fetch<PrepareResult>('/api/mirror/prepare', {
        query: { dataContent: candidate.dataContent, extract: shouldExtract ? '1' : '0' },
        timeout: RACE_TIMEOUT_MS,
        retry: 0,
      })
      return { prepared, shouldExtract, iframeUrl: prepared?.iframeUrl }
    } catch {
      return null
    }
  }

  async function fetchOk(candidate: MirrorCandidate): Promise<{ candidate: MirrorCandidate, result: { prepared: PrepareResult, shouldExtract: boolean, iframeUrl: string | null } }> {
    const result = await prepareCandidate(candidate)
    if (!result || !result.iframeUrl) throw new Error('mirror failed')
    return { candidate, result }
  }

  function settleOk(promise: Promise<{ candidate: MirrorCandidate, result: { prepared: PrepareResult, shouldExtract: boolean, iframeUrl: string | null } }>): Promise<{ candidate: MirrorCandidate, result: { prepared: PrepareResult, shouldExtract: boolean, iframeUrl: string | null } } | null> {
    return promise.then((value) => value).catch(() => null)
  }

  async function tryMirror(candidate: MirrorCandidate, sessionId: number): Promise<boolean> {
    if (!isCurrentSession(sessionId)) return false
    if (tryInitialStream(candidate, sessionId)) return true
    options.activeQuality.value = candidate.quality
    const result = await prepareCandidate(candidate)
    if (!result || !canUsePreparedMirror(sessionId, result.iframeUrl)) return false
    return activatePreparedMirror(result.iframeUrl as string, result.prepared, result.shouldExtract)
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
    options.useIframe.value = false
    options.directUrl.value = null
    options.directKind.value = null
  }

  function fallbackCandidates(startCandidate: MirrorCandidate, manual: boolean) {
    if (manual) return [startCandidate]
    return [
      startCandidate,
      ...buildFallbackOrder(options.episode.value.mirrors, startCandidate.quality, startCandidate.name),
    ]
  }

  function startPlaybackResolution(seamless: boolean) {
    const sessionId = ++playbackSession
    fallbackRunning = false
    options.loadingMessage.value = seamless ? 'Mengganti kualitas...' : 'Menyiapkan player...'
    if (!seamless) {
      options.resolving.value = true
      options.useIframe.value = false
      options.directUrl.value = null
      options.directKind.value = null
    }
    return sessionId
  }

  async function raceFirstOk(racers: MirrorCandidate[], sessionId: number): Promise<{ winner: MirrorCandidate, result: { prepared: PrepareResult, shouldExtract: boolean, iframeUrl: string | null } } | null> {
    if (racers.length === 0 || !isCurrentSession(sessionId)) return null
    const outcomes = await Promise.all(racers.map((candidate) => settleOk(fetchOk(candidate))))
    if (!isCurrentSession(sessionId)) return null
    for (const candidate of racers) {
      const match = outcomes.find((entry) => entry !== null && entry.candidate.dataContent === candidate.dataContent)
      if (match) return { winner: match.candidate, result: match.result }
    }
    return null
  }

  async function resolveInitialPlayback(startCandidate: MirrorCandidate, candidates: MirrorCandidate[], fallbackIdx: number, sessionId: number) {
    if (tryInitialStream(startCandidate, sessionId)) return { resolved: true, nextIndex: fallbackIdx }
    if (!isCurrentSession(sessionId)) return { resolved: false, nextIndex: fallbackIdx }
    const racers = candidates.slice(0, 2)
    const raced = await raceFirstOk(racers, sessionId)
    if (raced && isCurrentSession(sessionId)) {
      options.activeQuality.value = raced.winner.quality
      const activated = activatePreparedMirror(raced.result.iframeUrl as string, raced.result.prepared, raced.result.shouldExtract)
      if (activated) {
        const consumed = candidates.findIndex((entry) => entry.dataContent === raced.winner.dataContent)
        return { resolved: true, nextIndex: consumed === -1 ? racers.length : consumed + 1 }
      }
    }
    if (!isCurrentSession(sessionId)) return { resolved: false, nextIndex: racers.length }
    const result = await resolveCandidateList(candidates, racers.length, sessionId)
    return { resolved: result.resolved, nextIndex: result.nextIndex }
  }

  function finishPlaybackResolution(resolved: boolean, sessionId: number) {
    if (!isCurrentSession(sessionId)) return
    if (!resolved) activateDefaultIframe()
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
          if (!result.resolved) activateDefaultIframe()
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
    activateIframe,
    invalidatePlaybackSession,
    playWithFallback,
    triggerFallback,
  }
}
