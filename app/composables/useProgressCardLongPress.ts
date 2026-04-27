const LONG_PRESS_DELAY_MS = 550
const MOVE_TOLERANCE_PX = 12

export function useProgressCardLongPress() {
  let timer: number | null = null
  let startX = 0
  let startY = 0
  let suppressClick = false

  function clearLongPress() {
    if (timer === null) return
    window.clearTimeout(timer)
    timer = null
  }

  function onProgressCardPointerDown(event: PointerEvent, animeSlug: string | null) {
    if (!animeSlug || event.button !== 0) return
    clearLongPress()
    startX = event.clientX
    startY = event.clientY
    timer = window.setTimeout(() => {
      timer = null
      suppressClick = true
      void navigateTo(`/${animeSlug}`)
    }, LONG_PRESS_DELAY_MS)
  }

  function onProgressCardPointerMove(event: PointerEvent) {
    if (timer === null) return
    if (Math.abs(event.clientX - startX) > MOVE_TOLERANCE_PX || Math.abs(event.clientY - startY) > MOVE_TOLERANCE_PX) {
      clearLongPress()
    }
  }

  function onProgressCardPointerEnd() {
    clearLongPress()
  }

  function onProgressCardClick(event: MouseEvent) {
    if (!suppressClick) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    suppressClick = false
  }

  function onProgressCardContextMenu(event: MouseEvent, hasProgress: boolean) {
    if (hasProgress) event.preventDefault()
  }

  onBeforeUnmount(clearLongPress)

  return {
    onProgressCardPointerDown,
    onProgressCardPointerMove,
    onProgressCardPointerEnd,
    onProgressCardClick,
    onProgressCardContextMenu,
  }
}
