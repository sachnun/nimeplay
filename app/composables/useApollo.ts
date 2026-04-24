import type { ApolloClient, FetchPolicy, MutationOptions, OperationVariables, QueryOptions } from '@apollo/client/core'
import type { DocumentNode } from 'graphql'

type ProvidedApollo = ApolloClient

export function useApolloClient() {
  const { $apollo } = useNuxtApp()
  return $apollo as ProvidedApollo
}

export async function graphqlQuery<TData, TVariables extends OperationVariables = OperationVariables>(
  query: DocumentNode,
  variables?: TVariables,
  fetchPolicy: FetchPolicy = 'cache-first',
): Promise<TData> {
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
  const apollo = useApolloClient()
  const result = await apollo.mutate<TData, TVariables>({
    mutation,
    variables,
  } as MutationOptions<TData, TVariables>)

  return (result.data as TData | null | undefined) ?? null
}
