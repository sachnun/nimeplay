<script setup lang="ts">
import { fetchSynopsisId } from '~/utils/remote'

const props = defineProps<{
  synopsisId?: string
  synopsisEn?: string
  malId?: number
  loading: boolean
}>()

const JUNK_SOURCE = new Set([
  'synopsis',
  'sinopsis',
  '-',
  '--',
  '...',
  'tba',
  'n/a',
  'na',
  'ongoing',
  'completed',
])

function cleanSource(value: string | null | undefined): string {
  const text = value?.trim() ?? ''
  if (!text || text.length < 10) return ''
  if (JUNK_SOURCE.has(text.toLowerCase())) return ''
  return text
}

const expanded = ref(false)
const clamped = ref(false)
const textRef = ref<HTMLParagraphElement | null>(null)
const translated = ref('')
const translating = ref(false)
const failed = ref(false)

const hasIdProp = computed(() => !!props.synopsisId?.trim())
const source = computed(() => cleanSource(props.synopsisEn))
const text = computed(() => props.synopsisId?.trim() || translated.value.trim())
const showBody = computed(() => !!text.value || props.loading || translating.value || (!!source.value && !failed.value))

async function ensureTranslation() {
  if (hasIdProp.value || translated.value || translating.value) return
  const en = source.value
  if (!en || !import.meta.client) return
  translating.value = true
  failed.value = false
  const result = await fetchSynopsisId(props.malId, en)
  if (result) {
    translated.value = result
    expanded.value = false
  } else {
    failed.value = true
  }
  translating.value = false
}

function retry() {
  failed.value = false
  void ensureTranslation()
}

watch(() => props.synopsisEn, () => {
  translated.value = ''
  failed.value = false
})

if (import.meta.client) {
  watch(source, (en) => {
    if (en && !hasIdProp.value) void ensureTranslation()
  }, { immediate: true })
}

watch([text, expanded, translating, () => props.loading], () => {
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
      <div v-else-if="props.loading || translating" class="space-y-2 animate-pulse">
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
      <p v-if="failed && !text && !translating" class="text-sm text-zinc-500">
        Gagal memuat sinopsis.
        <button class="text-zinc-300 underline underline-offset-2 hover:text-white transition-colors cursor-pointer" @click="retry">
          Coba lagi
        </button>
      </p>
    </div>
  </section>
</template>
