<script lang="ts">
  import type { Snippet } from 'svelte'
  import { onMount, untrack } from 'svelte'
  import { innerHeight } from 'svelte/reactivity/window'

  let {
    thumbnail = undefined,
    title = undefined,
    onclose,
    children,
  }: {
    thumbnail?: string
    title?: string
    onclose: () => void
    children: Snippet
  } = $props()

  let scrollRef: HTMLElement | null = $state(null)
  const vh = $derived(innerHeight.current ?? 800)
  let panelHeightPx = $state((innerHeight.current ?? 800) * 0.8)
  let dragY = $state(innerHeight.current ?? 800)
  let isFull = $state(false)
  let ready = $state(false)
  let dragging = $state(false)
  let closing = $state(false)
  let contentDragging = false
  let contentMode: 'expand' | 'down' | null = null
  let grabStartY = 0
  let grabStartHeight = 0
  let contentStartY = 0
  let lastY = 0
  let lastTime = 0
  let velocity = 0
  let closed = false

  const collapsedHeight = () => vh * 0.8
  const fullHeight = () => vh

  const panelStyle = $derived(
    `height: ${panelHeightPx}px; transform: translate3d(0, ${dragY}px, 0); transition: ${
      dragging || !ready
        ? 'none'
        : closing
          ? 'height 150ms cubic-bezier(0.4, 0, 1, 1), transform 150ms cubic-bezier(0.4, 0, 1, 1)'
          : 'height 300ms cubic-bezier(0.16, 1, 0.3, 1), transform 300ms cubic-bezier(0.16, 1, 0.3, 1)'
    }`,
  )

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') requestClose()
  }

  $effect(() => {
    void vh
    untrack(() => {
      if (!ready) return
      panelHeightPx = isFull ? fullHeight() : collapsedHeight()
      dragY = 0
    })
  })

  function finishClose() {
    if (closed) return
    closed = true
    onclose()
  }

  export function requestClose() {
    if (closing) return
    closing = true
    dragging = false
    contentDragging = false
    dragY = panelHeightPx
    setTimeout(finishClose, 260)
  }

  function onTransitionEnd(event: TransitionEvent) {
    if (closing && event.propertyName === 'transform') finishClose()
  }

  function onPointerDown(event: PointerEvent) {
    if (closing) return
    dragging = true
    grabStartY = lastY = event.clientY
    grabStartHeight = panelHeightPx
    lastTime = performance.now()
    velocity = 0
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return
    const clientY = event.clientY
    const now = performance.now()
    const elapsed = now - lastTime
    if (elapsed > 0) velocity = (clientY - lastY) / elapsed
    lastY = clientY
    lastTime = now
    const rawHeight = grabStartHeight - (clientY - grabStartY)
    panelHeightPx = Math.min(fullHeight(), Math.max(collapsedHeight(), rawHeight))
    dragY = Math.max(0, collapsedHeight() - rawHeight)
  }

  function onPointerUp() {
    if (!dragging) return
    dragging = false
    if (dragY > collapsedHeight() * 0.25 || velocity > 0.5) {
      requestClose()
      return
    }
    const expand = panelHeightPx > (collapsedHeight() + fullHeight()) / 2 || velocity < -0.5
    isFull = expand
    panelHeightPx = expand ? fullHeight() : collapsedHeight()
    dragY = 0
  }

  function onContentTouchStart(event: TouchEvent) {
    if (closing) return
    const touch = event.touches[0]
    if (!touch) return
    contentDragging = false
    contentMode = null
    contentStartY = touch.clientY
  }

  function beginContentDrag(clientY: number, now: number): boolean {
    if ((scrollRef?.scrollTop ?? 0) > 0) return false
    const delta = clientY - contentStartY
    if (delta < -8 && panelHeightPx < fullHeight()) contentMode = 'expand'
    else if (delta > 8) contentMode = 'down'
    else return false
    contentDragging = true
    dragging = true
    grabStartY = contentStartY
    grabStartHeight = panelHeightPx
    lastY = contentStartY
    lastTime = now
    velocity = 0
    return true
  }

  function applyExpandDrag(up: number) {
    const el = scrollRef
    const past = up - (fullHeight() - grabStartHeight)
    if (past > 0) {
      panelHeightPx = fullHeight()
      isFull = true
      if (el) el.scrollTop = past
    } else {
      panelHeightPx = Math.min(fullHeight(), Math.max(collapsedHeight(), grabStartHeight + up))
      isFull = false
      if (el) el.scrollTop = 0
    }
    dragY = 0
  }

  function onContentTouchMove(event: TouchEvent) {
    if (closing) return
    const touch = event.touches[0]
    if (!touch) return
    const clientY = touch.clientY
    const now = performance.now()
    if (!contentDragging && !beginContentDrag(clientY, now)) return
    event.preventDefault()
    const elapsed = now - lastTime
    if (elapsed > 0) velocity = (clientY - lastY) / elapsed
    lastY = clientY
    lastTime = now
    const up = contentStartY - clientY
    if (contentMode === 'expand') {
      applyExpandDrag(up)
      return
    }
    dragY = up < 0 ? -up : -up * 0.2
  }

  function onContentTouchEnd() {
    if (!contentDragging) return
    contentDragging = false
    dragging = false
    if (contentMode === 'expand') {
      const expand = panelHeightPx > (collapsedHeight() + fullHeight()) / 2 || velocity < -0.5
      isFull = expand
      panelHeightPx = expand ? fullHeight() : collapsedHeight()
      dragY = 0
    } else if (contentMode === 'down') {
      if (dragY > panelHeightPx * 0.25 || velocity > 0.5) requestClose()
      else dragY = 0
    }
    contentMode = null
  }

  onMount(() => {
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeydown)
    const el = scrollRef
    el?.addEventListener('touchstart', onContentTouchStart, { passive: true })
    el?.addEventListener('touchmove', onContentTouchMove, { passive: false })
    el?.addEventListener('touchend', onContentTouchEnd)
    el?.addEventListener('touchcancel', onContentTouchEnd)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ready = true
        dragY = 0
      })
    })
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKeydown)
      el?.removeEventListener('touchstart', onContentTouchStart)
      el?.removeEventListener('touchmove', onContentTouchMove)
      el?.removeEventListener('touchend', onContentTouchEnd)
      el?.removeEventListener('touchcancel', onContentTouchEnd)
    }
  })
</script>

<div class="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Anime detail">
  <div
    class="absolute inset-0"
    role="button"
    tabindex="-1"
    aria-label="Close"
    onclick={requestClose}
    onkeydown={e => {
      if (e.key === 'Enter') requestClose()
    }}
  ></div>

  <div
    class="absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl bg-background shadow-2xl shadow-black/70 overflow-hidden"
    style={panelStyle}
    ontransitionend={onTransitionEnd}
  >
    <div
      class="relative shrink-0 flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none"
      role="presentation"
      onpointerdown={onPointerDown}
      onpointermove={onPointerMove}
      onpointerup={onPointerUp}
      onpointercancel={onPointerUp}
    >
      {#if thumbnail}
        <img
          src={thumbnail}
          alt=""
          aria-hidden="true"
          class="absolute inset-0 w-full h-full object-cover blur-xl opacity-15 pointer-events-none transform-gpu [contain:strict]"
        />
      {/if}
      <div class="relative w-10 h-1.5 rounded-full bg-zinc-600"></div>
    </div>
    <div bind:this={scrollRef} class="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {@render children()}
    </div>
  </div>
</div>
