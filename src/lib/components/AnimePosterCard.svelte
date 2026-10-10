<script lang="ts">
  import type { Snippet } from 'svelte'
  import { goto } from '$app/navigation'

  let {
    to,
    thumbnail,
    title,
    badge = '',
    newEpisode = false,
    subtitle = '',
    resumeTo = undefined,
    progressPct = undefined,
    priority = false,
    fullRounded = false,
    overlay,
  }: {
    to: string
    thumbnail: string
    title: string
    badge?: string
    newEpisode?: boolean
    subtitle?: string
    resumeTo?: string
    progressPct?: number
    priority?: boolean
    fullRounded?: boolean
    overlay?: Snippet
  } = $props()

  function openResume(event: MouseEvent) {
    event.stopPropagation()
    event.preventDefault()
    if (resumeTo) void goto(resumeTo)
  }
</script>

<a
  href={to}
  class="block w-full max-w-[200px] overflow-hidden bg-card relative outline-none group hover:border-accent focus:border-accent hover:z-10 focus:z-10 [@media(max-height:600px)]:max-w-[150px]"
  class:rounded-lg={fullRounded}
  class:rounded-t-lg={!fullRounded}
>
  <div class="relative aspect-[3/4] overflow-hidden">
    <img
      src={thumbnail}
      alt={title}
      width="300"
      height="400"
      loading={priority ? 'eager' : 'lazy'}
      fetchpriority={priority ? 'high' : 'auto'}
      decoding="async"
      sizes="(min-width: 640px) 200px, 50vw"
      class="object-cover w-full h-full"
    />
    {#if badge}
      <div
        class="absolute top-2 right-2 text-xs px-2 py-0.5 rounded font-medium"
        class:bg-teal-500={newEpisode}
        class:text-white={newEpisode}
        class:bg-zinc-700={!newEpisode}
        class:text-zinc-200={!newEpisode}
      >
        {badge}
      </div>
    {/if}
    {#if overlay}{@render overlay()}{/if}
    <div
      class="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 group-hover:from-black/60 to-transparent"
    ></div>
    <div
      class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-3 pt-8"
      class:pb-5={resumeTo}
      class:!pt-12={resumeTo}
    >
      <p class="text-sm font-semibold text-white leading-tight line-clamp-2">{title}</p>
      {#if resumeTo}
        <button type="button" class="text-xs text-zinc-400 mt-1 cursor-pointer" onclick={openResume}>{subtitle}</button>
      {:else if subtitle}
        <p class="text-xs text-zinc-400 mt-1">{subtitle}</p>
      {/if}
    </div>
    {#if resumeTo && progressPct !== undefined}
      <button
        type="button"
        aria-label="Lanjutkan menonton"
        class="absolute bottom-2 left-3 right-3 h-[3px] bg-white/20 rounded-full overflow-hidden cursor-pointer"
        onclick={openResume}
      >
        <span class="block h-full bg-white rounded-full" style:width="{progressPct}%"></span>
      </button>
    {/if}
  </div>
</a>
