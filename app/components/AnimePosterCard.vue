<script setup lang="ts">
const props = withDefaults(defineProps<{
  to: string
  thumbnail: string
  title: string
  badge?: string
  subtitle?: string
  resumeTo?: string
  progressPct?: number
  priority?: boolean
  zoom?: boolean
  fullRounded?: boolean
}>(), {
  badge: '',
  subtitle: '',
  resumeTo: undefined,
  progressPct: undefined,
  priority: false,
  zoom: false,
  fullRounded: false,
})

const router = useRouter()

function openResume(event: Event) {
  event.stopPropagation()
  event.preventDefault()
  if (props.resumeTo) void router.push(props.resumeTo)
}
</script>

<template>
  <NuxtLink
    :to="to"
    class="block overflow-hidden bg-card relative outline-none group hover:border-accent focus:border-accent hover:z-10 focus:z-10"
    :class="fullRounded ? 'rounded-lg' : 'rounded-t-lg'"
  >
    <div class="relative aspect-[3/4] overflow-hidden">
      <img
        :src="thumbnail"
        :alt="title"
        width="300"
        height="400"
        :loading="priority ? 'eager' : 'lazy'"
        :fetchpriority="priority ? 'high' : 'auto'"
        decoding="async"
        sizes="(min-width: 640px) 200px, 50vw"
        class="object-cover w-full h-full"
        :class="zoom ? 'transition-transform duration-300 ease-out group-hover:scale-110' : ''"
      >
      <div v-if="badge" class="absolute top-2 right-2 bg-zinc-700 text-zinc-200 text-xs px-2 py-0.5 rounded font-medium">
        {{ badge }}
      </div>
      <slot name="overlay" />
      <div class="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 group-hover:from-black/60 to-transparent" />
      <div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8" :class="resumeTo ? 'pb-5 !pt-12' : ''">
        <p class="text-sm font-semibold text-white leading-tight line-clamp-2">{{ title }}</p>
        <p v-if="resumeTo" class="text-xs text-zinc-400 mt-1 cursor-pointer" @click.stop.prevent="openResume">{{ subtitle }}</p>
        <p v-else-if="subtitle" class="text-xs text-zinc-400 mt-1">{{ subtitle }}</p>
      </div>
      <div v-if="resumeTo && progressPct !== undefined" class="absolute bottom-2 left-3 right-3 h-[3px] bg-white/20 rounded-full overflow-hidden cursor-pointer" @click.stop.prevent="openResume">
        <div class="h-full bg-white rounded-full" :style="{ width: `${progressPct}%` }" />
      </div>
    </div>
  </NuxtLink>
</template>
