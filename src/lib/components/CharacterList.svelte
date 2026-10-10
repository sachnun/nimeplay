<script lang="ts">
  import type { AnimeCharacter } from '#lib/shared/types'

  let { characters = undefined }: { characters?: AnimeCharacter[] } = $props()

  const displayed = $derived(characters ?? [])
</script>

{#if characters && characters.length > 0}
  <section class="@container">
    <h2 class="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Characters</h2>
    <div class="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:gap-x-4 @[420px]:[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
      {#each displayed as char (char.name)}
        <div class="flex items-center gap-2 sm:gap-2.5 min-w-0 rounded-lg px-1.5 py-1 -mx-1.5">
          <img
            src={char.imageUrl}
            alt={char.name}
            width="40"
            height="40"
            loading="lazy"
            decoding="async"
            class="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover flex-shrink-0"
          />
          <div class="min-w-0">
            <span class="text-xs text-zinc-200 truncate block" class:font-bold={char.role === 'Main'} class:font-medium={char.role !== 'Main'}>
              {char.name}
            </span>
            {#if char.voiceActor}
              <span class="text-[10px] text-zinc-500 truncate block">CV: {char.voiceActor.name}</span>
            {:else}
              <span class="text-[10px]" class:text-white={char.role === 'Main'} class:text-zinc-500={char.role !== 'Main'}>
                {char.role}
              </span>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </section>
{/if}
