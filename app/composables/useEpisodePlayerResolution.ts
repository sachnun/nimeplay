import type { Ref } from 'vue'
import type { EpisodeData } from '~/utils/types'
import { buildFallbackOrder, isExtractable, type MirrorCandidate } from '~/utils/player'

interface EpisodePlayerResolutionOptions {
  activeQuality: Ref<string>
  directUrl: Ref<string | null>
  episode: Ref<EpisodeData>
  iframeSrc: Ref<string | null>
  loadingMessage: Ref<string>
  resolving: Ref<boolean>
  useIframe: Ref<boolean>
}

export function useEpisodePlayerResolution(options: EpisodePlayerResolutionOptions) {
  const trpc = useTrpc()
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

  function activateIframe(url: string | null) {
    if (!url) return false
    options.iframeSrc.value = url
    options.directUrl.value = null
    options.useIframe.value = true
    return true
  }

  function activateDirectUrl(url: string | null | undefined) {
    if (!url) return false
    options.useIframe.value = false
    options.directUrl.value = url
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

  function activateExtractedMirror(iframeUrl: string, proxiedUrl: string | null | undefined) {
    if (activateDirectUrl(proxiedUrl)) return true
    return canUseIframeFallback(iframeUrl) && activateIframe(iframeUrl)
  }

  function activatePreparedMirror(iframeUrl: string, prepared: { ok?: boolean; proxiedUrl?: string | null }, shouldExtract: boolean) {
    options.iframeSrc.value = iframeUrl
    if (!shouldExtract) return prepared.ok === true && activateIframe(iframeUrl)
    return activateExtractedMirror(iframeUrl, prepared.proxiedUrl)
  }

  async function prepareCandidate(candidate: MirrorCandidate) {
    try {
      const shouldExtract = isExtractable(candidate.name)
      const prepared = await trpc.prepareMirror.mutate({ dataContent: candidate.dataContent, extract: shouldExtract })
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
