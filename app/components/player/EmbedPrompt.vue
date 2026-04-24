<script setup lang="ts">
defineProps<{ backTo: string }>()
defineEmits<{ continue: [] }>()
</script>

<template>
  <div class="absolute inset-0 z-40 flex items-center justify-center bg-black/90 backdrop-blur-sm">
    <div class="max-w-sm w-full mx-4 rounded-2xl bg-zinc-900 border border-white/10 shadow-2xl overflow-hidden">
      <div class="px-6 pt-6 pb-4 flex flex-col items-center text-center">
        <div class="w-12 h-12 rounded-full bg-amber-500/15 flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" :stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
          </svg>
        </div>
        <h3 class="text-base font-semibold text-white mb-2">Embed Player</h3>
        <p class="text-sm text-zinc-400 leading-relaxed">
          Native player tidak tersedia untuk episode ini. Embed player dari pihak ketiga akan digunakan.
        </p>
        <div class="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <span class="text-xs text-amber-300/90">Kemungkinan terdapat iklan dari pihak ketiga</span>
        </div>
      </div>
      <div class="px-6 pb-6 flex gap-3">
        <NuxtLink :to="backTo" class="flex-1 py-2.5 text-sm font-medium text-center rounded-lg bg-white/5 border border-white/10 text-zinc-300 hover:bg-white/10 transition-colors">
          Kembali
        </NuxtLink>
        <button class="flex-1 py-2.5 text-sm font-medium rounded-lg bg-white text-zinc-900 hover:bg-zinc-200 transition-colors cursor-pointer" @click="$emit('continue')">
          Lanjutkan
        </button>
      </div>
    </div>
  </div>
</template>
