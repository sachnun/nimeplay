<script setup lang="ts">
defineProps<{ indicator: { side: 'left' | 'right'; seconds: number } }>()
</script>

<template>
  <div
    class="absolute top-0 bottom-0 z-[15] flex items-center pointer-events-none"
    :class="indicator.side === 'left' ? 'left-0 w-[30%] justify-center' : 'right-0 w-[30%] justify-center'"
  >
    <div class="flex flex-col items-center gap-1 animate-[seekPulse_0.6s_ease-out_forwards]">
      <svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path :d="indicator.side === 'left' ? 'M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z' : 'M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z'" />
      </svg>
      <span class="text-sm font-semibold text-white">{{ indicator.seconds }}s</span>
    </div>
  </div>
</template>
