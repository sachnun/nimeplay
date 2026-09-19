<script setup lang="ts">
defineProps<{ thumbnail?: string }>()
const emit = defineEmits<{ close: [] }>()

const panelRef = ref<HTMLElement | null>(null)
const scrollRef = ref<HTMLElement | null>(null)
const viewportHeight = import.meta.client ? window.innerHeight : 800
const dragY = ref(viewportHeight)
const panelHeightPx = ref(viewportHeight * 0.8)
const ready = ref(false)
const dragging = ref(false)
const closing = ref(false)
let contentStartY = 0
let contentDragging = false
let startY = 0
let lastY = 0
let lastTime = 0
let velocity = 0
let closed = false

const panelStyle = computed(() => ({
  transform: `translate3d(0, ${dragY.value}px, 0)`,
  transition: dragging.value || !ready.value
    ? 'none'
    : closing.value
      ? 'transform 220ms cubic-bezier(0.4, 0, 1, 1)'
      : 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1)',
}))

function syncPanelHeight() {
  panelHeightPx.value = panelRef.value?.offsetHeight || viewportHeight * 0.8
}

onMounted(() => {
  syncPanelHeight()
  document.body.style.overflow = 'hidden'
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', syncPanelHeight)
  const el = scrollRef.value
  el?.addEventListener('touchstart', onContentTouchStart, { passive: true })
  el?.addEventListener('touchmove', onContentTouchMove, { passive: false })
  el?.addEventListener('touchend', endDrag)
  el?.addEventListener('touchcancel', endDrag)
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ready.value = true
      dragY.value = 0
    })
  })
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', syncPanelHeight)
  const el = scrollRef.value
  el?.removeEventListener('touchstart', onContentTouchStart)
  el?.removeEventListener('touchmove', onContentTouchMove)
  el?.removeEventListener('touchend', endDrag)
  el?.removeEventListener('touchcancel', endDrag)
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') requestClose()
}

function finishClose() {
  if (closed) return
  closed = true
  emit('close')
}

function requestClose() {
  if (closing.value) return
  closing.value = true
  dragging.value = false
  contentDragging = false
  dragY.value = panelHeightPx.value
  setTimeout(finishClose, 320)
}

function onTransitionEnd(event: TransitionEvent) {
  if (closing.value && event.propertyName === 'transform') finishClose()
}

function startDrag(clientY: number) {
  dragging.value = true
  startY = lastY = clientY
  lastTime = performance.now()
  velocity = 0
}

function moveDrag(clientY: number) {
  const now = performance.now()
  const elapsed = now - lastTime
  if (elapsed > 0) velocity = (clientY - lastY) / elapsed
  lastY = clientY
  lastTime = now
  const delta = clientY - startY
  dragY.value = delta > 0 ? delta : delta * 0.2
}

function endDrag() {
  if (!dragging.value) return
  dragging.value = false
  contentDragging = false
  if (dragY.value > panelHeightPx.value * 0.25 || velocity > 0.5) requestClose()
  else dragY.value = 0
}

function onPointerDown(event: PointerEvent) {
  if (closing.value) return
  startDrag(event.clientY)
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (dragging.value) moveDrag(event.clientY)
}

function onContentTouchStart(event: TouchEvent) {
  if (closing.value) return
  const touch = event.touches[0]
  if (!touch) return
  contentDragging = false
  contentStartY = touch.clientY
}

function onContentTouchMove(event: TouchEvent) {
  if (closing.value) return
  const touch = event.touches[0]
  if (!touch) return
  const clientY = touch.clientY
  if (!contentDragging) {
    if ((scrollRef.value?.scrollTop ?? 0) > 0 || clientY - contentStartY < 8) return
    contentDragging = true
    startDrag(clientY)
  }
  event.preventDefault()
  moveDrag(clientY)
}

defineExpose({ requestClose })
</script>

<template>
  <div class="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Anime detail">
    <div class="absolute inset-0" @click="requestClose" />

    <div
      ref="panelRef"
      class="absolute inset-x-0 bottom-0 flex flex-col h-[80vh] rounded-t-2xl bg-background shadow-2xl shadow-black/70 overflow-hidden"
      :style="panelStyle"
      @transitionend="onTransitionEnd"
    >
      <div
        class="relative shrink-0 flex justify-center pt-3 pb-2 cursor-grab active:cursor-grabbing touch-none"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="endDrag"
        @pointercancel="endDrag"
      >
        <img v-if="thumbnail" :src="thumbnail" alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover blur-xl opacity-15 pointer-events-none transform-gpu [contain:strict]">
        <div class="relative w-10 h-1.5 rounded-full bg-zinc-600" />
      </div>
      <div ref="scrollRef" class="flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <slot />
      </div>
    </div>
  </div>
</template>
