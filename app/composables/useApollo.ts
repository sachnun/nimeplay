import type { ApolloClient, FetchPolicy, MutationOptions, OperationVariables, QueryOptions } from '@apollo/client/core'
import { print, type DocumentNode } from 'graphql'

type ProvidedApollo = ApolloClient

interface GraphQLFetchResponse<TData> {
  data?: TData | null
  errors?: { message: string }[]
}

export function useApolloClient() {
  const { $apollo } = useNuxtApp()
  return $apollo as ProvidedApollo
}

async function graphqlServerFetch<TData, TVariables extends OperationVariables = OperationVariables>(
  query: DocumentNode,
  variables?: TVariables,
): Promise<TData | null> {
  const requestFetch = useRequestFetch()
  const response = await requestFetch<GraphQLFetchResponse<TData>>('/api/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: {
      query: print(query),
      variables,
    },
  })

  if (response.errors?.length) {
    throw new Error(response.errors.map((error) => error.message).join('\n'))
  }

  return response.data ?? null
}

export async function graphqlQuery<TData, TVariables extends OperationVariables = OperationVariables>(
  query: DocumentNode,
  variables?: TVariables,
  fetchPolicy: FetchPolicy = 'cache-first',
): Promise<TData> {
  if (import.meta.server) {
    const data = await graphqlServerFetch<TData, TVariables>(query, variables)
    if (!data) throw new Error('GraphQL response missing data')
    return data
  }

  const apollo = useApolloClient()
  const result = await apollo.query<TData, TVariables>({
    query,
    variables,
    fetchPolicy,
  } as QueryOptions<TVariables, TData>)

  return result.data as TData
}

export async function graphqlMutation<TData, TVariables extends OperationVariables = OperationVariables>(
  mutation: DocumentNode,
  variables?: TVariables,
): Promise<TData | null> {
  if (import.meta.server) return graphqlServerFetch<TData, TVariables>(mutation, variables)

  const apollo = useApolloClient()
  const result = await apollo.mutate<TData, TVariables>({
    mutation,
    variables,
  } as MutationOptions<TData, TVariables>)

  return (result.data as TData | null | undefined) ?? null
}
