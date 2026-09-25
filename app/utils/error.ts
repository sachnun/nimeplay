export function isServerError(error: unknown): boolean {
  if (!error) return false
  const { statusCode, status } = error as { statusCode?: unknown, status?: unknown }
  const code = statusCode ?? status
  return typeof code !== 'number' || code >= 500
}
