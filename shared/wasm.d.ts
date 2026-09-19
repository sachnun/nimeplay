declare module '*.wasm' {
  const mod: WebAssembly.Module
  export default mod
}

declare module '*.wasm?module' {
  const mod: WebAssembly.Module
  export default mod
}
