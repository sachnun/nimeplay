<script setup lang="ts">
import type { JikanCharacter } from '~/utils/types'

const props = defineProps<{ characters: JikanCharacter[] }>()

const showAll = ref(false)
const preview = ref<JikanCharacter | null>(null)
const mainChars = computed(() => props.characters.filter((c) => c.role === 'Main'))
const hasSupporting = computed(() => props.characters.length > mainChars.value.length)
const displayed = computed(() => showAll.value ? props.characters : mainChars.value.length > 0 ? mainChars.value : props.characters.slice(0, 10))

function closePreview() {
  preview.value = null
}

onMounted(() => {
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') closePreview()
  }
  document.addEventListener('keydown', onKey)
  onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
})
</script>

<template>
  <div v-if="characters.length > 0">
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-x-4 gap-y-2.5">
      <button
        v-for="char in displayed"
        :key="char.name"
        type="button"
        class="flex items-center gap-2.5 min-w-0 cursor-pointer rounded-lg px-1.5 py-1 -mx-1.5 text-left hover:bg-white/5 transition-colors"
        @click="preview = char"
      >
        <img
          :src="char.imageUrl"
          :alt="char.name"
          width="40"
          height="40"
          loading="lazy"
          decoding="async"
          sizes="40px"
          class="w-10 h-10 rounded-full object-cover flex-shrink-0"
        >
        <div class="min-w-0">
          <span class="text-xs text-zinc-200 font-medium truncate block">{{ char.name }}</span>
          <span v-if="char.voiceActor" class="text-[10px] text-zinc-500 truncate block">CV: {{ char.voiceActor.name }}</span>
          <span v-else class="text-[10px]" :class="char.role === 'Main' ? 'text-white' : 'text-zinc-500'">{{ char.role }}</span>
        </div>
      </button>
    </div>

    <button
      v-if="hasSupporting"
      class="mt-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
      @click="showAll = !showAll"
    >
      {{ showAll ? 'Show Main Only' : `Show All (${characters.length})` }}
    </button>

      <div
        v-if="preview"
        data-tv-nav-scope
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm cursor-pointer"
        @click="closePreview"
      >
      <div class="relative max-w-xs w-full mx-4 animate-in fade-in zoom-in-95 duration-200 cursor-default" @click.stop>
        <div class="relative w-full aspect-[3/4]">
          <img
            :src="preview.imageUrl"
            :alt="preview.name"
            width="384"
            height="512"
            loading="eager"
            decoding="async"
            class="rounded-xl object-cover shadow-2xl w-full h-full"
          >
        </div>
        <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent rounded-b-xl px-4 py-3">
          <p class="text-sm font-semibold text-white">{{ preview.name }}</p>
          <p class="text-xs text-zinc-300">{{ preview.voiceActor ? `CV: ${preview.voiceActor.name}` : preview.role }}</p>
        </div>
        <button
          type="button"
          class="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 flex items-center justify-center text-sm transition-colors cursor-pointer"
          @click="closePreview"
        >
          x
        </button>
      </div>
    </div>
  </div>
</template>
