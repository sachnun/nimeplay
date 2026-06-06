<script setup lang="ts">
defineProps<{ volume: number; isMuted: boolean }>()
</script>

<template>
  <div class="absolute inset-0 z-[15] flex items-center justify-center pointer-events-none">
    <div class="flex items-center gap-2 px-4 py-2 rounded-full bg-black/60 backdrop-blur-sm animate-[seekPulse_0.8s_ease-out_forwards]">
      <svg class="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path :d="isMuted || volume === 0
          ? 'M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z'
          : volume < 0.33
            ? 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z'
            : 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'" />
      </svg>
      <span class="text-sm font-semibold text-white tabular-nums">{{ isMuted ? 0 : Math.round(volume * 100) }}%</span>
    </div>
  </div>
</template>
