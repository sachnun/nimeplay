<script lang="ts">
  import { goto } from '$app/navigation'
  import { SvelteSet } from 'svelte/reactivity'
  import { onMount } from 'svelte'

  let {
    className = 'fixed inset-0 bg-black z-50',
    message = 'Memuat...',
    title = null,
    malId = null,
    controlsSkeleton = true,
    header = true,
  }: {
    className?: string
    message?: string
    title?: string | null
    malId?: number | null
    controlsSkeleton?: boolean
    header?: boolean
  } = $props()

  function goBack() {
    if (window.history.state?.back) {
      history.back()
      return
    }
    if (malId) void goto(`/anime/${malId}`)
    else void goto('/')
  }

  type Block = [number, number]
  type Shape = Block[]

  const PIECES: Shape[][] = [
    [
      [[0, 0], [0, 1], [0, 2], [0, 3]],
      [[0, 0], [1, 0], [2, 0], [3, 0]],
    ],
    [
      [[0, 0], [0, 1], [1, 0], [1, 1]],
    ],
    [
      [[0, 0], [0, 1], [0, 2], [1, 1]],
      [[0, 0], [1, 0], [1, 1], [2, 0]],
      [[0, 1], [1, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 0], [1, 1], [2, 1]],
    ],
    [
      [[0, 1], [0, 2], [1, 0], [1, 1]],
      [[0, 0], [1, 0], [1, 1], [2, 1]],
    ],
    [
      [[0, 0], [0, 1], [1, 1], [1, 2]],
      [[0, 1], [1, 0], [1, 1], [2, 0]],
    ],
    [
      [[0, 0], [1, 0], [2, 0], [2, 1]],
      [[0, 0], [0, 1], [0, 2], [1, 0]],
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[0, 2], [1, 0], [1, 1], [1, 2]],
    ],
    [
      [[0, 1], [1, 1], [2, 0], [2, 1]],
      [[0, 0], [1, 0], [1, 1], [1, 2]],
      [[0, 0], [0, 1], [1, 0], [2, 0]],
      [[0, 0], [0, 1], [0, 2], [1, 2]],
    ],
  ]

  const COLS = 6
  const ROWS = 10
  const CELL = 12
  const GAP = 2
  const STEP = CELL + GAP

  type CellData = { id: number; row: number; col: number }
  type Move = { shape: Shape; col: number; land: number }
  type ScoredMove = Move & { score: number }

  let grid = $state<boolean[][]>(Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false)))
  let id = 0
  let busy = $state(false)
  let cells = $state<CellData[]>([])
  const clearRows = new SvelteSet<number>()
  let fading = $state(false)

  function isInsideBoard(row: number, col: number): boolean {
    return row < ROWS && col >= 0 && col < COLS
  }

  function isCellFree(row: number, col: number): boolean {
    return isInsideBoard(row, col) && !grid[row]?.[col]
  }

  function canPlace(shape: Shape, row: number, col: number): boolean {
    return shape.every(([dr, dc]) => isCellFree(row + dr, col + dc))
  }

  function findLanding(shape: Shape, col: number): number {
    let land = -1
    for (let t = 0; t < ROWS; t++) {
      if (canPlace(shape, t, col)) land = t
      else break
    }
    return land
  }

  function columnHeight(sim: boolean[][], col: number): number {
    const firstFilled = sim.findIndex(row => row[col])
    return firstFilled === -1 ? 0 : ROWS - firstFilled
  }

  function countColumnHoles(sim: boolean[][], col: number): number {
    let holes = 0
    let found = false
    for (const row of sim) {
      if (row[col]) found = true
      else if (found) holes++
    }
    return holes
  }

  function bumpiness(heights: number[]): number {
    return heights.slice(0, -1).reduce((total, height, index) => total + Math.abs(height - (heights[index + 1] ?? 0)), 0)
  }

  function evaluate(sim: boolean[][]): number {
    const heights = Array.from({ length: COLS }, (_, col) => columnHeight(sim, col))
    const lines = sim.filter(row => row.every(Boolean)).length
    let holes = 0
    for (let c = 0; c < COLS; c++) holes += countColumnHoles(sim, c)
    return 8 * lines - 5 * holes - 2 * bumpiness(heights) - 0.3 * heights.reduce((a, b) => a + b, 0)
  }

  function columnsFor(shape: Shape): number[] {
    const maxDc = Math.max(...shape.map(([, dc]) => dc))
    return Array.from({ length: COLS - maxDc }, (_, col) => col)
  }

  function simulateMove(shape: Shape, col: number, land: number): boolean[][] {
    const sim = grid.map(r => [...r])
    for (const [dr, dc] of shape) {
      const row = sim[land + dr]
      if (row) row[col + dc] = true
    }
    return sim
  }

  function moveForColumn(shape: Shape, col: number): ScoredMove | null {
    const land = findLanding(shape, col)
    if (land < 0) return null
    return { shape, col, land, score: evaluate(simulateMove(shape, col, land)) }
  }

  function validMoves(piece: Shape[]): ScoredMove[] {
    return piece.flatMap(shape =>
      columnsFor(shape)
        .map(col => moveForColumn(shape, col))
        .filter((move): move is ScoredMove => move !== null),
    )
  }

  function pickBest(piece: Shape[]): Move | null {
    const best = validMoves(piece).reduce<ScoredMove | null>(
      (current, move) => (!current || move.score > current.score ? move : current),
      null,
    )
    return best ? { shape: best.shape, col: best.col, land: best.land } : null
  }

  function resetBoard(schedule: (fn: () => void, ms: number) => void) {
    busy = true
    fading = true
    schedule(() => {
      grid = Array.from({ length: ROWS }, () => Array(COLS).fill(false))
      cells = []
      fading = false
      busy = false
    }, 500)
  }

  function placeMove(move: Move) {
    const added: CellData[] = []
    for (const [dr, dc] of move.shape) {
      const row = grid[move.land + dr]
      if (!row) continue
      row[move.col + dc] = true
      added.push({ id: ++id, row: move.land + dr, col: move.col + dc })
    }
    cells = [...cells, ...added]
  }

  function getFullRows(): number[] {
    return grid.map((row, rowIndex) => (row.every(Boolean) ? rowIndex : -1)).filter(row => row !== -1)
  }

  function collapseRows(full: number[]) {
    const kept = grid.filter((_, rowIndex) => !full.includes(rowIndex)).map(row => [...row])
    while (kept.length < ROWS) kept.unshift(Array(COLS).fill(false))
    grid = kept
    cells = cells
      .filter(cell => !full.includes(cell.row))
      .map(cell => ({ ...cell, row: cell.row + full.filter(row => row > cell.row).length }))
    clearRows.clear()
    busy = false
  }

  function clearFullRows(full: number[], schedule: (fn: () => void, ms: number) => void) {
    busy = true
    schedule(() => {
      clearRows.clear()
      for (const row of full) clearRows.add(row)
      schedule(() => collapseRows(full), 350)
    }, 50)
  }

  function isBoardBlocked(): boolean {
    return Boolean(grid[1]?.some(Boolean))
  }

  function nextMove(): Move | null {
    const piece = PIECES[Math.floor(Math.random() * PIECES.length)]
    return piece ? pickBest(piece) : null
  }

  function tick(schedule: (fn: () => void, ms: number) => void) {
    if (busy) return
    if (isBoardBlocked()) return resetBoard(schedule)
    const move = nextMove()
    if (!move) return
    placeMove(move)
    const full = getFullRows()
    if (full.length > 0) clearFullRows(full, schedule)
  }

  onMount(() => {
    const timeouts = new Set<ReturnType<typeof setTimeout>>()
    const schedule = (fn: () => void, ms: number) => {
      const tid = setTimeout(() => {
        timeouts.delete(tid)
        fn()
      }, ms)
      timeouts.add(tid)
    }
    const interval = setInterval(() => tick(schedule), 600)
    return () => {
      clearInterval(interval)
      timeouts.forEach(t => clearTimeout(t))
    }
  })
</script>

<div class={className}>
  {#if header}
    <div class="absolute top-0 left-0 right-0 z-20 px-4 md:px-8 pt-4 pb-12 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
      <div class="flex items-center gap-3 min-w-0">
        {#if malId}
          <button
            type="button"
            class="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-white/15 hover:bg-white/25 transition-colors cursor-pointer"
            aria-label="Kembali"
            onclick={goBack}
          >
            <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        {:else}
          <div class="w-9 h-9 rounded-full bg-white/15 animate-pulse"></div>
        {/if}
        {#if title}
          <h1 class="min-w-0 flex-1 text-sm md:text-base font-semibold text-white/90 truncate">{title}</h1>
        {:else}
          <div class="h-4 w-48 bg-white/10 rounded animate-pulse"></div>
        {/if}
      </div>
    </div>
  {/if}

  <div class="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
    <div
      class="relative transition-opacity duration-400"
      style:width="{COLS * STEP - GAP}px"
      style:height="{ROWS * STEP - GAP}px"
      style:opacity={fading ? 0 : 1}
    >
      {#each cells as cell (cell.id)}
        <div
          class="absolute rounded-[2px] transition-[top,background-color] duration-200 ease-in animate-[tetrisCellDrop_0.3s_ease-out_backwards]"
          style:left="{cell.col * STEP}px"
          style:top="{cell.row * STEP}px"
          style:width="{CELL}px"
          style:height="{CELL}px"
          style:background-color={clearRows.has(cell.row) ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.7)'}
          style:--fall="{(cell.row + 1) * STEP}px"
        ></div>
      {/each}
    </div>
    <span class="text-xs text-white/40 font-medium tracking-wide">{message}</span>
  </div>

  {#if controlsSkeleton}
    <div class="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
      <div class="px-4 md:px-8 pb-4 pt-20">
        <div class="h-1 w-full rounded-full bg-white/15 mb-3"></div>
        <div class="flex items-center gap-1 md:gap-2">
          <div class="w-9 h-9 rounded-full bg-white/10 animate-pulse"></div>
          <div class="w-8 h-8 rounded-full bg-white/10 animate-pulse"></div>
          <div class="w-8 h-8 rounded-full bg-white/10 animate-pulse"></div>
          <div class="h-3 w-24 bg-white/10 rounded animate-pulse"></div>
          <div class="flex-1"></div>
          <div class="hidden md:block h-7 w-14 bg-white/10 rounded-lg animate-pulse"></div>
          <div class="hidden md:block h-7 w-10 bg-white/10 rounded-lg animate-pulse"></div>
          <div class="hidden md:flex w-9 h-9 rounded-full bg-white/10 animate-pulse"></div>
          <div class="w-9 h-9 rounded-full bg-white/10 animate-pulse"></div>
        </div>
      </div>
    </div>
  {/if}
</div>
