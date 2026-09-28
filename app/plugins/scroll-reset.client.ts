export default defineNuxtPlugin(() => {
  if (!('scrollRestoration' in window.history)) return
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  if (nav?.type !== 'reload') return
  window.history.scrollRestoration = 'manual'
  window.scrollTo(0, 0)
})
