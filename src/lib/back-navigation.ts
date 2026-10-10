import { afterNavigate } from '$app/navigation'

let previous: string | null = null

export function trackNavigation(): void {
  afterNavigate(navigation => {
    previous = navigation.from?.url.pathname ?? null
  })
}

export function previousPath(): string | null {
  return previous
}
