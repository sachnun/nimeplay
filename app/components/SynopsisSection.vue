<script setup lang="ts">
const props = defineProps<{
  synopsis?: string
}>()

const expanded = ref(false)
const clamped = ref(false)
const textRef = shallowRef<HTMLParagraphElement | null>(null)

const hasSynopsis = computed(() => !!props.synopsis?.trim())
const text = computed(() => props.synopsis ?? '')

watch([text, expanded], () => {
  if (expanded.value || !import.meta.client) return
  requestAnimationFrame(() => {
    const el = textRef.value
    if (el) clamped.value = el.scrollHeight > el.clientHeight
  })
}, { immediate: true })
</script>

<template>
  <section v-if="hasSynopsis">
    <div class="flex items-center gap-3 mb-3">
      <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
        Sinopsis
      </h2>
    </div>
    <div>
      <p
        ref="textRef"
        class="text-sm text-zinc-300 leading-relaxed whitespace-pre-line [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]"
        :class="[!expanded ? 'lg:line-clamp-none line-clamp-4' : '', clamped && !expanded ? 'cursor-pointer' : '']"
        @click="clamped && !expanded && (expanded = true)"
      >
        {{ text }}
      </p>
      <button
        v-if="clamped && !expanded"
        class="lg:hidden mt-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
        @click="expanded = true"
      >
        Read more
      </button>
    </div>
  </section>
</template>
