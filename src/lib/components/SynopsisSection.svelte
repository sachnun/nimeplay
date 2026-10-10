<script lang="ts">
  let { synopsis = undefined }: { synopsis?: string } = $props()

  let expanded = $state(false)
  let clamped = $state(false)
  let textEl: HTMLParagraphElement | null = $state(null)

  const hasSynopsis = $derived(!!synopsis?.trim())
  const text = $derived(synopsis ?? '')

  $effect(() => {
    void text
    void expanded
    if (expanded || typeof window === 'undefined') return
    requestAnimationFrame(() => {
      const el = textEl
      if (el) clamped = el.scrollHeight > el.clientHeight
    })
  })
</script>

{#if hasSynopsis}
  <section>
    <div class="flex items-center gap-3 mb-3">
      <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">
        Sinopsis
      </h2>
    </div>
    <div>
      <p
        bind:this={textEl}
        class="text-sm text-zinc-300 leading-relaxed whitespace-pre-line [text-shadow:0_1px_4px_rgba(0,0,0,0.6)] {!expanded ? 'lg:line-clamp-none line-clamp-4' : ''} {clamped && !expanded ? 'cursor-pointer' : ''}"
        onclick={() => clamped && !expanded && (expanded = true)}
      >
        {text}
      </p>
      {#if clamped && !expanded}
        <button
          class="lg:hidden mt-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
          onclick={() => (expanded = true)}
        >
          Read more
        </button>
      {/if}
    </div>
  </section>
{/if}
