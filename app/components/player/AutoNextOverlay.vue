<script setup lang="ts">
defineProps<{ countdown: number }>()
defineEmits<{ next: []; cancel: [] }>()
</script>

<template>
  <div class="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-30">
    <p class="text-zinc-200 text-lg mb-4">
      Episode selanjutnya dalam <span class="font-bold text-white">{{ countdown }}</span> detik
    </p>
    <div class="flex gap-3">
      <button class="px-5 py-2 bg-zinc-100 hover:bg-white text-zinc-900 text-sm font-semibold rounded-md transition-colors cursor-pointer" @click="$emit('next')">
        Putar Sekarang
      </button>
      <button class="px-5 py-2 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-sm font-semibold rounded-md transition-colors cursor-pointer" @click="$emit('cancel')">
        Batal
      </button>
    </div>
  </div>
</template>
