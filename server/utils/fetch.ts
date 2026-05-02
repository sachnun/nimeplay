export function timeoutSignal(ms: number): AbortSignal | undefined {
  return AbortSignal.timeout(ms)
}
