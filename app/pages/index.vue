<script setup lang="ts">
import type { TrpcOutputs } from '~/types/trpc'

type HomeData = TrpcOutputs['home']

useHead({ title: 'Nimeplay' })

const trpc = useTrpc()
const { data, pending } = await useAsyncData<HomeData>('home', async () => {
  return trpc.home.query()
}, {
  default: () => ({
    ongoingData: { anime: [], totalPages: 1 },
    completedData: { anime: [], totalPages: 1 },
    genres: [],
  }),
})
</script>

<template>
  <div class="px-6 py-8">
    <HomeContent
      :ongoing-data="data.ongoingData"
      :completed-data="data.completedData"
      :genres="data.genres"
      :is-loading="pending"
    />
  </div>
</template>
