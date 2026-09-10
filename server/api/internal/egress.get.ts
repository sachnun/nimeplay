export default defineEventHandler(async (event) => {
  const placement = getHeader(event, 'cf-placement') ?? null
  try {
    const info = await $fetch<{ ip?: string, country?: string, region?: string, city?: string }>(
      'https://ipinfo.io/json',
      { signal: AbortSignal.timeout(8000) },
    )
    return {
      ip: info.ip ?? null,
      country: info.country ?? null,
      region: info.region ?? null,
      city: info.city ?? null,
      placement,
    }
  }
  catch {
    return { ip: null, country: null, region: null, city: null, placement }
  }
})
