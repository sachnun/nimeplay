import { bestCandidate, hasHiddenOverflow, isEditableElement, rectsIntersect, type Direction, type TvCandidate } from '~/utils/tvNavigation'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

const DIRECTION_BY_KEY: Record<string, Direction | undefined> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
}

const DIRECTION_BY_KEY_CODE: Record<number, Direction | undefined> = {
  19: 'up',
  20: 'down',
  21: 'left',
  22: 'right',
  37: 'left',
  38: 'up',
  39: 'right',
  40: 'down',
}

export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()

  function markRemoteActive() {
    document.body.classList.add('tv-remote-active')
  }

  function clearRemoteActive() {
    document.body.classList.remove('tv-remote-active')
  }

  function isHiddenByOverflow(element: HTMLElement, rect: DOMRect) {
    return overflowParents(element).some((parent) => hasHiddenOverflow(parent) && !rectsIntersect(rect, parent.getBoundingClientRect()))
  }

  function overflowParents(element: HTMLElement) {
    const parents: HTMLElement[] = []
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) parents.push(parent)
    return parents
  }

  function hasUsableStyle(element: HTMLElement) {
    const style = window.getComputedStyle(element)
    return style.display !== 'none' && style.visibility !== 'hidden' && style.pointerEvents !== 'none'
  }

  function hasUsableRect(element: HTMLElement) {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0 && !isHiddenByOverflow(element, rect)
  }

  function isUsable(element: HTMLElement) {
    if (element.closest('[aria-hidden="true"], [inert]')) return false
    return hasUsableStyle(element) && hasUsableRect(element)
  }

  function getVisibleScopes() {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-tv-nav-scope]')).filter(isUsable)
  }

  function getScope(active: HTMLElement | null) {
    const activeScope = activeNavScope(active)
    if (activeScope) return activeScope

    const scopes = getVisibleScopes()
    return scopes.at(-1) ?? document.body
  }

  function activeNavScope(active: HTMLElement | null) {
    const activeScope = active?.closest<HTMLElement>('[data-tv-nav-scope]')
    return activeScope && isUsable(activeScope) ? activeScope : null
  }

  function shouldLetPlayerHandle(active: HTMLElement | null) {
    if (!document.querySelector('.player-shell')) return false
    return !active?.closest('[data-tv-nav-scope]') && getVisibleScopes().length === 0
  }

  function getCandidates(scope: HTMLElement) {
    return Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => element.tabIndex >= 0 && isUsable(element))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
  }

  function focusElement(element: HTMLElement) {
    element.focus({ preventScroll: true })
    element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  function focusFirst(scope: HTMLElement) {
    const [first] = getCandidates(scope)
    if (!first) return false
    focusElement(first.element)
    return true
  }

  function activeElement() {
    return document.activeElement instanceof HTMLElement ? document.activeElement : null
  }

  function shouldFocusFirst(active: HTMLElement | null, scope: HTMLElement) {
    if (!active) return true
    return active === document.body || !isUsable(active) || !scope.contains(active)
  }

  function focusFromActive(scope: HTMLElement, active: HTMLElement, direction: Direction) {
    const next = bestCandidate(getCandidates(scope), active, direction, active.getBoundingClientRect())
    if (!next) return false
    focusElement(next.element)
    return true
  }

  function moveFocus(direction: Direction) {
    const active = activeElement()
    if (shouldLetPlayerHandle(active)) return false

    const scope = getScope(active)
    if (shouldFocusFirst(active, scope)) return focusFirst(scope)
    return focusFromActive(scope, active as HTMLElement, direction)
  }

  function directionFromEvent(event: KeyboardEvent) {
    return DIRECTION_BY_KEY[event.key] ?? DIRECTION_BY_KEY_CODE[event.keyCode] ?? null
  }

  function handleDirectionalKey(event: KeyboardEvent, direction: Direction) {
    if (!canHandleDirection(event, direction)) return false
    markRemoteActive()
    return moveFocus(direction)
  }

  function canHandleDirection(event: KeyboardEvent, direction: Direction) {
    const target = event.target instanceof HTMLElement ? event.target : null
    return !isEditableElement(target) || direction === 'up' || direction === 'down'
  }

  function onKeyDown(event: KeyboardEvent) {
    const direction = directionFromEvent(event)
    if (direction && handleDirectionalKey(event, direction)) event.preventDefault()
  }

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('pointerdown', clearRemoteActive, { passive: true })
  window.addEventListener('mousemove', clearRemoteActive, { passive: true })

  router.afterEach(() => {
    if (!document.body.classList.contains('tv-remote-active')) return
    window.setTimeout(() => {
      const scope = getScope(null)
      focusFirst(scope)
    }, 100)
  })

  nuxtApp.hook('app:beforeMount', () => {
    document.body.classList.remove('tv-remote-active')
  })
})
