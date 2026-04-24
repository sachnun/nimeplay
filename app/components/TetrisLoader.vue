<script setup lang="ts">
const PIECES = [
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

const grid = ref(Array.from({ length: ROWS }, () => Array(COLS).fill(false)))
const id = ref(0)
const busy = ref(false)
const cells = ref<CellData[]>([])
const clearRows = ref(new Set<number>())
const fading = ref(false)

function findLanding(shape: number[][], col: number): number {
  let land = -1
  for (let t = 0; t < ROWS; t++) {
    let ok = true
    for (const [dr, dc] of shape) {
      const r = t + dr
      const c = col + dc
      if (r >= ROWS || grid.value[r][c]) { ok = false; break }
    }
    if (ok) land = t
    else break
  }
  return land
}

function evaluate(sim: boolean[][]): number {
  const heights = Array(COLS).fill(0)
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (sim[r][c]) { heights[c] = ROWS - r; break }
    }
  }
  let lines = 0
  for (let r = 0; r < ROWS; r++) if (sim[r].every(Boolean)) lines++
  let holes = 0
  for (let c = 0; c < COLS; c++) {
    let found = false
    for (let r = 0; r < ROWS; r++) {
      if (sim[r][c]) found = true
      else if (found) holes++
    }
  }
  let bumps = 0
  for (let c = 0; c < COLS - 1; c++) bumps += Math.abs(heights[c] - heights[c + 1])
  return 8 * lines - 5 * holes - 2 * bumps - 0.3 * heights.reduce((a, b) => a + b, 0)
}

function pickBest(piece: number[][][]): { shape: number[][]; col: number; land: number } | null {
  let best: { shape: number[][]; col: number; land: number } | null = null
  let bestScore = -Infinity
  for (const shape of piece) {
    const maxDc = Math.max(...shape.map((b) => b[1]))
    for (let col = 0; col <= COLS - 1 - maxDc; col++) {
      const land = findLanding(shape, col)
      if (land < 0) continue
      const sim = grid.value.map((r) => [...r])
      for (const [dr, dc] of shape) sim[land + dr][col + dc] = true
      const score = evaluate(sim)
      if (score > bestScore) {
        bestScore = score
        best = { shape, col, land }
      }
    }
  }
  return best
}

onMounted(() => {
  const timeouts = new Set<ReturnType<typeof setTimeout>>()
  const schedule = (fn: () => void, ms: number) => {
    const tid = setTimeout(() => { timeouts.delete(tid); fn() }, ms)
    timeouts.add(tid)
  }
  const interval = setInterval(() => {
    if (busy.value) return
    if (grid.value[1].some(Boolean)) {
      busy.value = true
      fading.value = true
      schedule(() => {
        grid.value = Array.from({ length: ROWS }, () => Array(COLS).fill(false))
        cells.value = []
        fading.value = false
        busy.value = false
      }, 500)
      return
    }
    const piece = PIECES[Math.floor(Math.random() * PIECES.length)]
    const move = pickBest(piece)
    if (!move) return
    const added: CellData[] = []
    for (const [dr, dc] of move.shape) {
      const r = move.land + dr
      const c = move.col + dc
      grid.value[r][c] = true
      added.push({ id: ++id.value, row: r, col: c })
    }
    cells.value = [...cells.value, ...added]
    const full: number[] = []
    for (let r = 0; r < ROWS; r++) if (grid.value[r].every(Boolean)) full.push(r)
    if (full.length > 0) {
      busy.value = true
      schedule(() => {
        clearRows.value = new Set(full)
        schedule(() => {
          const kept: boolean[][] = []
          for (let r = 0; r < ROWS; r++) if (!full.includes(r)) kept.push([...grid.value[r]])
          while (kept.length < ROWS) kept.unshift(Array(COLS).fill(false))
          grid.value = kept
          cells.value = cells.value.filter((c) => !full.includes(c.row)).map((c) => ({ ...c, row: c.row + full.filter((fr) => fr > c.row).length }))
          clearRows.value = new Set()
          busy.value = false
        }, 350)
      }, 50)
    }
  }, 600)
  onBeforeUnmount(() => {
    clearInterval(interval)
    timeouts.forEach((t) => clearTimeout(t))
  })
})
</script>

<template>
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
</template>
