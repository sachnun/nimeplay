export type Direction = 'up' | 'down' | 'left' | 'right'

export interface TvCandidate {
  element: HTMLElement
  rect: DOMRect
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const DIRECTION_PREDICATES: Record<Direction, (deltaX: number, deltaY: number) => boolean> = {
  left: (deltaX) => deltaX >= -4,
  right: (deltaX) => deltaX <= 4,
  up: (_, deltaY) => deltaY >= -4,
  down: (_, deltaY) => deltaY <= 4,
}

export function rectsIntersect(a: DOMRect, b: DOMRect): boolean {
  return a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom
}

export function isEditableElement(element: HTMLElement | null): boolean {
  return Boolean(element && (element.isContentEditable || EDITABLE_TAGS.has(element.tagName)))
}

export function hasHiddenOverflow(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  return `${style.overflow} ${style.overflowX} ${style.overflowY}`.includes('hidden')
}

export function isCandidateBehind(direction: Direction, deltaX: number, deltaY: number): boolean {
  return DIRECTION_PREDICATES[direction](deltaX, deltaY)
}

export function rectCenter(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export function scoreCandidate(direction: Direction, from: DOMRect, to: DOMRect) {
  const fromCenter = rectCenter(from)
  const toCenter = rectCenter(to)
  const deltaX = toCenter.x - fromCenter.x
  const deltaY = toCenter.y - fromCenter.y
  if (isCandidateBehind(direction, deltaX, deltaY)) return Number.POSITIVE_INFINITY

  const sameColumn = overlapsAxis(to.left, to.right, from.left, from.right)
  const sameRow = overlapsAxis(to.top, to.bottom, from.top, from.bottom)
  return direction === 'left' || direction === 'right'
    ? Math.abs(deltaX) * 1000 + Math.abs(deltaY) + (sameRow ? 0 : 500)
    : Math.abs(deltaY) * 1000 + Math.abs(deltaX) + (sameColumn ? 0 : 500)
}

function overlapsAxis(start: number, end: number, otherStart: number, otherEnd: number) {
  return end >= otherStart && start <= otherEnd
}

export function bestCandidate(candidates: TvCandidate[], active: HTMLElement, direction: Direction, fromRect: DOMRect) {
  return candidates
    .filter((candidate) => candidate.element !== active)
    .map((candidate) => ({ candidate, score: scoreCandidate(direction, fromRect, candidate.rect) }))
    .sort((a, b) => a.score - b.score)[0]?.candidate ?? null
}
