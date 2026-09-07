import type { Ref } from 'vue'
import type { EpisodeData, InitialStream } from '~/utils/types'
import type { MirrorCandidate } from '~/utils/player'

type PrepareResult = {
  iframeUrl: string | null
  playUrl: string | null
  kind: 'hls' | 'file' | null
  ok: boolean
}

type RacedMirror = {
  winner: MirrorCandidate
  result: { prepared: PrepareResult, shouldExtract: boolean, iframeUrl: string | null }
}

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

  function tryInitialStream(sessionId: number): boolean {
    const initial = options.initialStream.value
    if (!initial || !initial.ok || !initial.playUrl) return false
    if (!isCurrentSession(sessionId)) return false
    options.activeQuality.value = initial.quality || '720p'
    options.iframeSrc.value = initial.iframeUrl
    if (activateDirectUrl(initial.playUrl, initial.kind ?? null)) return true
    if (initial.iframeUrl) return activateIframe(initial.iframeUrl)
    return false
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

  async function tryMirror(candidate: MirrorCandidate, sessionId: number): Promise<boolean> {
    if (!isCurrentSession(sessionId)) return false
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

  async function raceFirstOk(racers: MirrorCandidate[], sessionId: number): Promise<RacedMirror | null> {
    if (racers.length === 0 || !isCurrentSession(sessionId)) return null
    return new Promise<RacedMirror | null>((resolve) => {
      let pending = racers.length
      let done = false
      const failOne = () => {
        pending -= 1
        if (pending <= 0 && !done) {
          done = true
          resolve(null)
        }
      }
      for (const candidate of racers) {
        prepareCandidate(candidate).then((result) => {
          if (done || !isCurrentSession(sessionId)) return
          if (result && result.iframeUrl) {
            done = true
            resolve({ winner: candidate, result })
          } else failOne()
        }).catch(() => {
          if (!done) failOne()
        })
      }
    })
  }

  function untried(candidates: MirrorCandidate[], tried: Set<string>) {
    return candidates.filter((entry) => !tried.has(entry.dataContent))
  }

  async function resolveCandidateListSkipping(candidates: MirrorCandidate[], tried: Set<string>, sessionId: number) {
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index]
      if (!candidate || tried.has(candidate.dataContent)) continue
      tried.add(candidate.dataContent)
      const result = await resolveCandidateAt(candidates, index, sessionId)
      if (result.stop) return { resolved: result.resolved }
    }
    return { resolved: false }
  }

  async function resolveInitialPlayback(candidates: MirrorCandidate[], sessionId: number) {
    const tried = new Set<string>()
    if (tryInitialStream(sessionId)) {
      const initial = options.initialStream.value
      if (initial) tried.add(initial.dataContent)
      return { resolved: true, remaining: untried(candidates, tried) }
    }
    if (!isCurrentSession(sessionId)) return { resolved: false, remaining: [] as MirrorCandidate[] }
    const racers = candidates.slice(0, 2)
    const raced = await raceFirstOk(racers, sessionId)
    if (raced && isCurrentSession(sessionId)) {
      options.activeQuality.value = raced.winner.quality
      tried.add(raced.winner.dataContent)
      const activated = activatePreparedMirror(raced.result.iframeUrl as string, raced.result.prepared, raced.result.shouldExtract)
      if (activated) return { resolved: true, remaining: untried(candidates, tried) }
    }
    if (!isCurrentSession(sessionId)) return { resolved: false, remaining: untried(candidates, tried) }
    const result = await resolveCandidateListSkipping(candidates, tried, sessionId)
    return { resolved: result.resolved, remaining: untried(candidates, tried) }
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
    const result = await resolveInitialPlayback(candidates, sessionId)
    const remaining = result.remaining
    let fallbackIdx = 0
    installFallbackHandler(remaining, sessionId, () => fallbackIdx, (index) => { fallbackIdx = index })
    finishPlaybackResolution(result.resolved, sessionId)
  }

  return {
    activateIframe,
    invalidatePlaybackSession,
    playWithFallback,
    triggerFallback,
  }
}
