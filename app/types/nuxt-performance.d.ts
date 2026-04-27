type RunIdle = (callback: () => void, timeout?: number) => () => void

declare module '#app' {
  interface NuxtApp {
    $runIdle: RunIdle
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $runIdle: RunIdle
  }
}

export {}
