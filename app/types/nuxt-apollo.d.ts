import type { ApolloClient } from '@apollo/client/core'

declare module '#app' {
  interface NuxtApp {
    $apollo: ApolloClient
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $apollo: ApolloClient
  }
}

export {}
