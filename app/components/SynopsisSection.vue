<script setup lang="ts">
const props = defineProps<{
  synopsis?: string
  loading: boolean
}>()

const expanded = ref(false)
const clamped = ref(false)
const textRef = ref<HTMLParagraphElement | null>(null)

const text = computed(() => props.synopsis?.trim() ?? '')
const showBody = computed(() => !!text.value || props.loading)

watch([text, expanded, () => props.loading], () => {
  if (expanded.value || !import.meta.client) return
  requestAnimationFrame(() => {
    const el = textRef.value
    if (el) clamped.value = el.scrollHeight > el.clientHeight
  })
}, { immediate: true })
</script>

<template>
  <section v-if="showBody">
    <div class="flex items-center gap-3 mb-3">
      <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
        Sinopsis
      </h2>
    </div>
    <div>
      <p
        v-if="text"
        ref="textRef"
        class="text-sm text-zinc-300 leading-relaxed [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]"
        :class="!expanded ? 'lg:line-clamp-none line-clamp-4' : ''"
      >
        {{ text }}
      </p>
      <div v-else class="space-y-2 animate-pulse">
        <div class="h-3.5 rounded bg-white/10" />
        <div class="h-3.5 rounded bg-white/10" />
        <div class="h-3.5 w-2/3 rounded bg-white/10" />
      </div>
      <button
        v-if="clamped && !expanded && text"
        class="lg:hidden mt-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
        @click="expanded = true"
      >
        Read more
      </button>
    </div>
  </section>
</template>
