type Direction = 'up' | 'down' | 'left' | 'right'

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

interface Candidate {
  element: HTMLElement
  rect: DOMRect
}

export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()

  function markRemoteActive() {
    document.body.classList.add('tv-remote-active')
  }

  function clearRemoteActive() {
    document.body.classList.remove('tv-remote-active')
  }

  function isEditable(element: HTMLElement | null) {
    if (!element) return false
    const tag = element.tagName
    return element.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
  }

  function isHiddenByOverflow(element: HTMLElement, rect: DOMRect) {
    let parent = element.parentElement
    while (parent && parent !== document.body) {
      const style = window.getComputedStyle(parent)
      if (`${style.overflow} ${style.overflowX} ${style.overflowY}`.includes('hidden')) {
        const parentRect = parent.getBoundingClientRect()
        const intersects = rect.right > parentRect.left
          && rect.left < parentRect.right
          && rect.bottom > parentRect.top
          && rect.top < parentRect.bottom
        if (!intersects) return true
      }
      parent = parent.parentElement
    }
    return false
  }

  function isUsable(element: HTMLElement) {
    if (element.closest('[aria-hidden="true"], [inert]')) return false
    const style = window.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false
    const rect = element.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return false
    if (isHiddenByOverflow(element, rect)) return false
    return true
  }

  function getVisibleScopes() {
    return Array.from(document.querySelectorAll<HTMLElement>('[data-tv-nav-scope]')).filter(isUsable)
  }

  function getScope(active: HTMLElement | null) {
    const activeScope = active?.closest<HTMLElement>('[data-tv-nav-scope]')
    if (activeScope && isUsable(activeScope)) return activeScope

    const scopes = getVisibleScopes()
    return scopes.at(-1) ?? document.body
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

  function scoreCandidate(direction: Direction, from: DOMRect, to: DOMRect) {
    const fromX = from.left + from.width / 2
    const fromY = from.top + from.height / 2
    const toX = to.left + to.width / 2
    const toY = to.top + to.height / 2
    const deltaX = toX - fromX
    const deltaY = toY - fromY
    const sameColumn = to.right >= from.left && to.left <= from.right
    const sameRow = to.bottom >= from.top && to.top <= from.bottom

    if (direction === 'left' && deltaX >= -4) return Number.POSITIVE_INFINITY
    if (direction === 'right' && deltaX <= 4) return Number.POSITIVE_INFINITY
    if (direction === 'up' && deltaY >= -4) return Number.POSITIVE_INFINITY
    if (direction === 'down' && deltaY <= 4) return Number.POSITIVE_INFINITY

    if (direction === 'left' || direction === 'right') {
      return Math.abs(deltaX) * 1000 + Math.abs(deltaY) + (sameRow ? 0 : 500)
    }
    return Math.abs(deltaY) * 1000 + Math.abs(deltaX) + (sameColumn ? 0 : 500)
  }

  function moveFocus(direction: Direction) {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (shouldLetPlayerHandle(active)) return false

    const scope = getScope(active)
    if (!active || active === document.body || !isUsable(active) || !scope.contains(active)) {
      return focusFirst(scope)
    }

    const fromRect = active.getBoundingClientRect()
    let next: Candidate | null = null
    let nextScore = Number.POSITIVE_INFINITY

    for (const candidate of getCandidates(scope)) {
      if (candidate.element === active) continue
      const score = scoreCandidate(direction, fromRect, candidate.rect)
      if (score < nextScore) {
        next = candidate
        nextScore = score
      }
    }

    if (!next) return false
    focusElement(next.element)
    return true
  }

  function onKeyDown(event: KeyboardEvent) {
    const direction = DIRECTION_BY_KEY[event.key] ?? DIRECTION_BY_KEY_CODE[event.keyCode]
    if (!direction) return

    const target = event.target instanceof HTMLElement ? event.target : null
    if (isEditable(target) && direction !== 'up' && direction !== 'down') return

    markRemoteActive()
    if (!moveFocus(direction)) return
    event.preventDefault()
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
