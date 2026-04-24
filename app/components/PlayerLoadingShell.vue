<script setup lang="ts">
withDefaults(defineProps<{ className?: string; message?: string }>(), {
  className: 'fixed inset-0 bg-black z-50',
  message: 'Memuat...',
})
</script>

<template>
  <div :class="className">
    <div class="absolute top-0 left-0 right-0 z-20 px-4 md:px-8 pt-4 pb-12 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-full bg-white/15 animate-pulse" />
        <div class="h-4 w-48 bg-white/10 rounded animate-pulse" />
      </div>
    </div>

    <div class="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
      <TetrisLoader />
      <span class="text-xs text-white/40 font-medium tracking-wide">{{ message }}</span>
    </div>

    <div class="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
      <div class="px-4 md:px-8 pb-4 pt-20">
        <div class="h-1 w-full rounded-full bg-white/15 mb-3" />
        <div class="flex items-center gap-1 md:gap-2">
          <div class="w-9 h-9 rounded-full bg-white/10 animate-pulse" />
          <div class="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
          <div class="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
          <div class="h-3 w-24 bg-white/10 rounded animate-pulse" />
          <div class="flex-1" />
          <div class="hidden md:block h-7 w-14 bg-white/10 rounded-lg animate-pulse" />
          <div class="hidden md:block h-7 w-10 bg-white/10 rounded-lg animate-pulse" />
          <div class="hidden md:flex w-9 h-9 rounded-full bg-white/10 animate-pulse" />
          <div class="w-9 h-9 rounded-full bg-white/10 animate-pulse" />
        </div>
      </div>
    </div>
  </div>
</template>
