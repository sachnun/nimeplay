<script setup lang="ts">
const props = withDefaults(defineProps<{ className?: string; message?: string; title?: string | null; malId?: number | null; controlsSkeleton?: boolean; header?: boolean }>(), {
  className: 'fixed inset-0 bg-black z-50',
  message: 'Memuat...',
  title: null,
  malId: null,
  controlsSkeleton: true,
  header: true,
})

const router = useRouter()

function goBack() {
  if (props.malId && !(window.history.length > 1)) {
    router.push(`/anime/${props.malId}`)
    return
  }
  if (window.history.length > 1) router.back()
  else if (props.malId) router.push(`/anime/${props.malId}`)
  else router.push('/')
}

type Block = [number, number]
type Shape = Block[]

const PIECES: Shape[][] = [
  [[[0, 0], [0, 1], [0, 2], [0, 3]], [[0, 0], [1, 0], [2, 0], [3, 0]]],
  [[[0, 0], [0, 1], [1, 0], [1, 1]]],
  [[[0, 0], [0, 1], [0, 2], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 0]], [[0, 1], [1, 0], [1, 1], [1, 2]], [[0, 1], [1, 0], [1, 1], [2, 1]]],
  [[[0, 1], [0, 2], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1], [2, 1]]],
  [[[0, 0], [0, 1], [1, 1], [1, 2]], [[0, 1], [1, 0], [1, 1], [2, 0]]],
  [[[0, 0], [1, 0], [2, 0], [2, 1]], [[0, 0], [0, 1], [0, 2], [1, 0]], [[0, 0], [0, 1], [1, 1], [2, 1]], [[0, 2], [1, 0], [1, 1], [1, 2]]],
  [[[0, 1], [1, 1], [2, 0], [2, 1]], [[0, 0], [1, 0], [1, 1], [1, 2]], [[0, 0], [0, 1], [1, 0], [2, 0]], [[0, 0], [0, 1], [0, 2], [1, 2]]],
]

const COLS = 6
const ROWS = 10
const CELL = 12
const GAP = 2
const STEP = CELL + GAP

type CellData = { id: number; row: number; col: number }
type Move = { shape: Shape; col: number; land: number }
type ScoredMove = Move & { score: number }

const grid = ref<boolean[][]>(Array.from({ length: ROWS }, () => Array<boolean>(COLS).fill(false)))
const id = ref(0)
const busy = ref(false)
const cells = ref<CellData[]>([])
const clearRows = ref(new Set<number>())
const fading = ref(false)

function isInsideBoard(row: number, col: number): boolean {
  return row < ROWS && col >= 0 && col < COLS
}

function isCellFree(row: number, col: number): boolean {
  return isInsideBoard(row, col) && !grid.value[row]?.[col]
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
  const firstFilled = sim.findIndex((row) => row[col])
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
  const lines = sim.filter((row) => row.every(Boolean)).length
  let holes = 0
  for (let c = 0; c < COLS; c++) holes += countColumnHoles(sim, c)
  return 8 * lines - 5 * holes - 2 * bumpiness(heights) - 0.3 * heights.reduce((a, b) => a + b, 0)
}

function columnsFor(shape: Shape): number[] {
  const maxDc = Math.max(...shape.map(([, dc]) => dc))
  return Array.from({ length: COLS - maxDc }, (_, col) => col)
}

function simulateMove(shape: Shape, col: number, land: number): boolean[][] {
  const sim = grid.value.map((r) => [...r])
  for (const [dr, dc] of shape) sim[land + dr]![col + dc] = true
  return sim
}

function moveForColumn(shape: Shape, col: number): ScoredMove | null {
  const land = findLanding(shape, col)
  if (land < 0) return null
  return { shape, col, land, score: evaluate(simulateMove(shape, col, land)) }
}

function validMoves(piece: Shape[]): ScoredMove[] {
  return piece.flatMap((shape) => columnsFor(shape).map((col) => moveForColumn(shape, col)).filter((move): move is ScoredMove => move !== null))
}

function pickBest(piece: Shape[]): Move | null {
  const best = validMoves(piece).reduce<ScoredMove | null>((current, move) => !current || move.score > current.score ? move : current, null)
  return best ? { shape: best.shape, col: best.col, land: best.land } : null
}

function resetBoard(schedule: (fn: () => void, ms: number) => void) {
  busy.value = true
  fading.value = true
  schedule(() => {
    grid.value = Array.from({ length: ROWS }, () => Array(COLS).fill(false))
    cells.value = []
    fading.value = false
    busy.value = false
  }, 500)
}

function placeMove(move: Move) {
  const added: CellData[] = []
  for (const [dr, dc] of move.shape) {
    const row = grid.value[move.land + dr]
    if (!row) continue
    row[move.col + dc] = true
    added.push({ id: ++id.value, row: move.land + dr, col: move.col + dc })
  }
  cells.value = [...cells.value, ...added]
}

function getFullRows(): number[] {
  return grid.value.map((row, rowIndex) => row.every(Boolean) ? rowIndex : -1).filter((row) => row !== -1)
}

function collapseRows(full: number[]) {
  const kept = grid.value.filter((_, rowIndex) => !full.includes(rowIndex)).map((row) => [...row])
  while (kept.length < ROWS) kept.unshift(Array(COLS).fill(false))
  grid.value = kept
  cells.value = cells.value.filter((cell) => !full.includes(cell.row)).map((cell) => ({ ...cell, row: cell.row + full.filter((row) => row > cell.row).length }))
  clearRows.value = new Set()
  busy.value = false
}

function clearFullRows(full: number[], schedule: (fn: () => void, ms: number) => void) {
  busy.value = true
  schedule(() => {
    clearRows.value = new Set(full)
    schedule(() => collapseRows(full), 350)
  }, 50)
}

function isBoardBlocked(): boolean {
  return Boolean(grid.value[1]?.some(Boolean))
}

function nextMove(): Move | null {
  const piece = PIECES[Math.floor(Math.random() * PIECES.length)]
  return piece ? pickBest(piece) : null
}

function tick(schedule: (fn: () => void, ms: number) => void) {
  if (busy.value) return
  if (isBoardBlocked()) return resetBoard(schedule)
  const move = nextMove()
  if (!move) return
  placeMove(move)
  const full = getFullRows()
  if (full.length > 0) clearFullRows(full, schedule)
}

onMounted(() => {
  const timeouts = new Set<ReturnType<typeof setTimeout>>()
  const schedule = (fn: () => void, ms: number) => {
    const tid = setTimeout(() => { timeouts.delete(tid); fn() }, ms)
    timeouts.add(tid)
  }
  const interval = setInterval(() => tick(schedule), 600)
  onBeforeUnmount(() => {
    clearInterval(interval)
    timeouts.forEach((t) => clearTimeout(t))
  })
})
</script>

<template>
  <div :class="className">
    <div v-if="header" class="absolute top-0 left-0 right-0 z-20 px-4 md:px-8 pt-4 pb-12 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
      <div class="flex items-center gap-3 min-w-0">
        <button v-if="malId" type="button" class="flex items-center justify-center w-9 h-9 shrink-0 rounded-full bg-white/15 hover:bg-white/25 transition-colors cursor-pointer" aria-label="Kembali" @click="goBack">
          <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" :stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div v-else class="w-9 h-9 rounded-full bg-white/15 animate-pulse" />
        <h1 v-if="title" class="min-w-0 flex-1 text-sm md:text-base font-semibold text-white/90 truncate">{{ title.replace('Subtitle Indonesia', '').trim() }}</h1>
        <div v-else class="h-4 w-48 bg-white/10 rounded animate-pulse" />
      </div>
    </div>

    <div class="absolute inset-0 flex flex-col items-center justify-center gap-5 px-6 text-center">
      <div class="relative transition-opacity duration-400" :style="{ width: `${COLS * STEP - GAP}px`, height: `${ROWS * STEP - GAP}px`, opacity: fading ? 0 : 1 }">
        <div
          v-for="cell in cells"
          :key="cell.id"
          class="absolute rounded-[2px] transition-[top,background-color] duration-200 ease-in animate-[tetrisCellDrop_0.3s_ease-out_backwards]"
          :style="{
            left: `${cell.col * STEP}px`,
            top: `${cell.row * STEP}px`,
            width: `${CELL}px`,
            height: `${CELL}px`,
            backgroundColor: clearRows.has(cell.row) ? 'rgba(255,255,255,1)' : 'rgba(255,255,255,0.7)',
            '--fall': `${(cell.row + 1) * STEP}px`,
          }"
        />
      </div>
      <span class="text-xs text-white/40 font-medium tracking-wide">{{ message }}</span>
    </div>

    <div v-if="controlsSkeleton" class="absolute bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
      <div class="px-4 md:px-8 pb-4 pt-20">
        <div class="h-1 w-full rounded-full bg-white/15 mb-3" />
        <div class="flex items-center gap-1 md:gap-2">
          <div class="w-9 h-9 rounded-full bg-white/10 animate-pulse" />
          <div class="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
          <div class="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
          <div class="h-3 w-24 bg-white/10 rounded animate-pulse" />
          <div class="flex-1" />
          <div class="hidden md:block h-7 w-14 bg-white/10 rounded-lg animate-pulse" />
          <div class="hidden md:block h-7 w-10 bg-white/10 rounded-lg animate-pulse" />
          <div class="hidden md:flex w-9 h-9 rounded-full bg-white/10 animate-pulse" />
          <div class="w-9 h-9 rounded-full bg-white/10 animate-pulse" />
        </div>
      </div>
    </div>
  </div>
</template>
