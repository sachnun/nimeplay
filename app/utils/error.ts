export function isServerError(error: unknown): boolean {
  if (!error) return false
  const statusCode = (error as { statusCode?: unknown }).statusCode
  return typeof statusCode !== 'number' || statusCode >= 500
}
