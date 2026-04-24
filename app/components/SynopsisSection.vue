<script setup lang="ts">
const props = defineProps<{
  synopsisId?: string
  synopsisEn?: string
  loading: boolean
}>()

const lang = ref<'id' | 'en'>(props.synopsisId ? 'id' : 'en')
const expanded = ref(false)
const clamped = ref(false)
const textRef = ref<HTMLParagraphElement | null>(null)

const hasId = computed(() => !!props.synopsisId)
const hasEn = computed(() => !!props.synopsisEn)
const hasBoth = computed(() => hasId.value && hasEn.value)
const text = computed(() => lang.value === 'id' && hasId.value ? props.synopsisId : props.synopsisEn)

function switchLang(newLang: 'id' | 'en') {
  lang.value = newLang
  expanded.value = false
}

watch([text, expanded, () => props.loading], () => {
  if (expanded.value || !import.meta.client) return
  requestAnimationFrame(() => {
    const el = textRef.value
    if (el) clamped.value = el.scrollHeight > el.clientHeight
  })
}, { immediate: true })
</script>

<template>
  <section>
    <div class="flex items-center gap-3 mb-3">
      <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
        Sinopsis
      </h2>
      <div v-if="hasBoth" class="flex items-center text-xs text-zinc-500">
        <button
          class="transition-colors cursor-pointer"
          :class="lang === 'id' ? 'text-zinc-200 font-semibold' : 'text-zinc-500 hover:text-zinc-400'"
          @click="switchLang('id')"
        >
          ID
        </button>
        <span class="mx-1.5 text-zinc-600">|</span>
        <button
          class="transition-colors cursor-pointer"
          :class="lang === 'en' ? 'text-zinc-200 font-semibold' : 'text-zinc-500 hover:text-zinc-400'"
          @click="switchLang('en')"
        >
          EN
        </button>
      </div>
    </div>
    <div v-if="loading" class="animate-pulse space-y-2">
      <div class="h-3 bg-zinc-800 rounded w-full" />
      <div class="h-3 bg-zinc-800 rounded w-5/6" />
      <div class="h-3 bg-zinc-800 rounded w-4/6 hidden lg:block" />
      <div class="h-3 bg-zinc-800 rounded w-5/6 hidden lg:block" />
    </div>
    <div v-else-if="hasId || hasEn">
      <p
        ref="textRef"
        class="text-sm text-zinc-300 leading-relaxed [text-shadow:0_1px_4px_rgba(0,0,0,0.6)]"
        :class="!expanded ? 'lg:line-clamp-none line-clamp-4' : ''"
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
