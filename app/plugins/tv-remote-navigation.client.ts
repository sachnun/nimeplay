type Direction = 'up' | 'down' | 'left' | 'right'

interface TvCandidate {
  element: HTMLElement
  rect: DOMRect
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const DIRECTION_TOLERANCE = 4
const DIAGONAL_PENALTY = 1_000_000

function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom
}

function isEditableElement(element: HTMLElement | null): boolean {
  return Boolean(element && (element.isContentEditable || EDITABLE_TAGS.has(element.tagName)))
}

function hasHiddenOverflow(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  return `${style.overflow} ${style.overflowX} ${style.overflowY}`.includes('hidden')
}

function rectCenter(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

function overlapSize(start: number, end: number, otherStart: number, otherEnd: number) {
  return Math.max(0, Math.min(end, otherEnd) - Math.max(start, otherStart))
}

function axisGap(start: number, end: number, otherStart: number, otherEnd: number) {
  if (overlapSize(start, end, otherStart, otherEnd) > 0) return 0
  return start > otherEnd ? start - otherEnd : otherStart - end
}

function scoreCandidate(direction: Direction, from: DOMRect, to: DOMRect) {
  const fromCenter = rectCenter(from)
  const toCenter = rectCenter(to)
  if (direction === 'left' || direction === 'right') {
    const deltaX = toCenter.x - fromCenter.x
    if ((direction === 'left' && deltaX >= -DIRECTION_TOLERANCE) || (direction === 'right' && deltaX <= DIRECTION_TOLERANCE)) return Number.POSITIVE_INFINITY
    const aligned = overlapSize(to.top, to.bottom, from.top, from.bottom) > 0
    const primaryDistance = direction === 'left' ? Math.max(0, from.left - to.right) : Math.max(0, to.left - from.right)
    const orthogonalDistance = axisGap(to.top, to.bottom, from.top, from.bottom)
    return (aligned ? 0 : DIAGONAL_PENALTY) + primaryDistance * 1000 + orthogonalDistance
  }
  const deltaY = toCenter.y - fromCenter.y
  if ((direction === 'up' && deltaY >= -DIRECTION_TOLERANCE) || (direction === 'down' && deltaY <= DIRECTION_TOLERANCE)) return Number.POSITIVE_INFINITY
  const aligned = overlapSize(to.left, to.right, from.left, from.right) > 0
  const primaryDistance = direction === 'up' ? Math.max(0, from.top - to.bottom) : Math.max(0, to.top - from.bottom)
  const orthogonalDistance = axisGap(to.left, to.right, from.left, from.right)
  return (aligned ? 0 : DIAGONAL_PENALTY) + primaryDistance * 1000 + orthogonalDistance
}

function bestCandidate(candidates: TvCandidate[], active: HTMLElement, direction: Direction, fromRect: DOMRect) {
  return candidates
    .filter((candidate) => candidate.element !== active)
    .map((candidate) => ({ candidate, score: scoreCandidate(direction, fromRect, candidate.rect) }))
    .sort((a, b) => a.score - b.score)[0]?.candidate ?? null
}

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
