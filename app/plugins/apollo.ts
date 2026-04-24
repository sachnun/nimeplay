import { ApolloClient, HttpLink, InMemoryCache } from '@apollo/client/core'

export default defineNuxtPlugin(() => {
  const url = import.meta.server ? useRequestURL() : null
  const uri = import.meta.server ? `${url!.origin}/api/graphql` : '/api/graphql'

  const apollo = new ApolloClient({
    cache: new InMemoryCache(),
    link: new HttpLink({ uri, credentials: 'same-origin' }),
    ssrMode: import.meta.server,
  })

  return {
    provide: { apollo },
  }
})
