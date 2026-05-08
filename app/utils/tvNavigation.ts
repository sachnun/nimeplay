export type Direction = 'up' | 'down' | 'left' | 'right'

export interface TvCandidate {
  element: HTMLElement
  rect: DOMRect
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

const DIRECTION_TOLERANCE = 4
const DIAGONAL_PENALTY = 1_000_000

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

export function rectCenter(rect: DOMRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
}

export function scoreCandidate(direction: Direction, from: DOMRect, to: DOMRect) {
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

function overlapSize(start: number, end: number, otherStart: number, otherEnd: number) {
  return Math.max(0, Math.min(end, otherEnd) - Math.max(start, otherStart))
}

function axisGap(start: number, end: number, otherStart: number, otherEnd: number) {
  if (overlapSize(start, end, otherStart, otherEnd) > 0) return 0
  return start > otherEnd ? start - otherEnd : otherStart - end
}

export function bestCandidate(candidates: TvCandidate[], active: HTMLElement, direction: Direction, fromRect: DOMRect) {
  return candidates
    .filter((candidate) => candidate.element !== active)
    .map((candidate) => ({ candidate, score: scoreCandidate(direction, fromRect, candidate.rect) }))
    .sort((a, b) => a.score - b.score)[0]?.candidate ?? null
}
