import * as cheerio from 'cheerio'

const OD_BASE = process.env.OD_BASE || 'https://otakudesu.blog'
const NIMEPLAY_BASE = process.env.SCRAPE_URL || process.env.NIMEPLAY_BASE || 'http://localhost:3000'
const OD_ONGOING_PAGES = Number(process.env.OD_PAGES || 5)
const OD_COMPLETED_PAGES = Number(process.env.OD_COMPLETED_PAGES || 3)

interface OdCard {
  slug: string
  title: string
  episodeText: string
  episode: number | null
}

interface NimeCard {
  malId: number
  title: string
  episode: string
  episodeNum: number | null
}

function episodeNumOf(text: string): number | null {
  const m = text.match(/(\d+)/)
  return m ? Number(m[1]) : null
}

function normTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      Accept: 'text/html',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.text()
}

function parseCards(html: string): { slug: string, title: string, episode: string }[] {
  const $ = cheerio.load(html)
  const out: { slug: string, title: string, episode: string }[] = []
  const detposts = $('.detpost').toArray()
  for (const el of detposts) {
    const root = $(el)
    const href = root.find('.thumb a').attr('href') || ''
    const slugMatch = href.match(/\/anime\/([^/]+)/)
    const slug = slugMatch?.[1] ?? ''
    if (!slug) continue
    out.push({
      slug,
      title: root.find('.jdlflm').text().trim(),
      episode: root.find('.epz').text().trim(),
    })
  }
  return out
}

async function fetchOdList(path: string, pages: number): Promise<OdCard[]> {
  const all: OdCard[] = []
  for (let page = 1; page <= pages; page++) {
    const url = page > 1 ? `${OD_BASE}/${path}/page/${page}/` : `${OD_BASE}/${path}/`
    try {
      const html = await fetchHtml(url)
      const cards = parseCards(html)
      if (cards.length === 0) break
      for (const c of cards) {
        all.push({ slug: c.slug, title: c.title, episodeText: c.episode, episode: episodeNumOf(c.episode) })
      }
    }
    catch (error) {
      console.warn(`[audit] OD ${path} page ${page} failed: ${error instanceof Error ? error.message : error}`)
      break
    }
  }
  return all
}

async function fetchNimeList(type: 'ONGOING' | 'COMPLETED', maxPages = 10): Promise<{ cards: NimeCard[], totalPages: number }> {
  const cards: NimeCard[] = []
  let totalPages = 1
  for (let page = 1; page <= maxPages; page++) {
    const res = await fetch(`${NIMEPLAY_BASE}/api/anime-page?type=${type}&page=${page}`)
    if (!res.ok) throw new Error(`Nimeplay ${type} page ${page}: HTTP ${res.status}`)
    const data = await res.json() as { anime: { malId: number, title: string, episode: string }[], totalPages: number }
    totalPages = data.totalPages ?? 1
    for (const a of data.anime ?? []) {
      cards.push({ malId: a.malId, title: a.title, episode: a.episode, episodeNum: episodeNumOf(a.episode ?? '') })
    }
    if (page >= totalPages) break
  }
  return { cards, totalPages }
}

async function main(): Promise<void> {
  const odOngoing = await fetchOdList('ongoing-anime', OD_ONGOING_PAGES)
  const odCompleted = await fetchOdList('complete-anime', OD_COMPLETED_PAGES)
  const odCompletedNorm = new Set(odCompleted.map(c => normTitle(c.title)))
  const nimeOngoing = await fetchNimeList('ONGOING', 10)
  const nimeCompleted = await fetchNimeList('COMPLETED', 5)

  const nimeByNorm = new Map<string, NimeCard>()
  for (const c of nimeOngoing.cards) {
    const key = normTitle(c.title)
    if (!nimeByNorm.has(key)) nimeByNorm.set(key, c)
  }
  const nimeCompletedNorm = new Set(nimeCompleted.cards.map(c => normTitle(c.title)))
  const odByNorm = new Map<string, OdCard>()
  for (const c of odOngoing) {
    const key = normTitle(c.title)
    if (!odByNorm.has(key)) odByNorm.set(key, c)
  }

  let matched = 0
  const missing: OdCard[] = []
  const lag: { title: string, odEp: number | null, nimeEp: number | null }[] = []
  for (const od of odOngoing) {
    const hit = nimeByNorm.get(normTitle(od.title))
    if (!hit) {
      missing.push(od)
    }
    else {
      matched++
      if (od.episode != null && hit.episodeNum != null && od.episode !== hit.episodeNum) {
        lag.push({ title: od.title, odEp: od.episode, nimeEp: hit.episodeNum })
      }
    }
  }

  const extra = nimeOngoing.cards.filter(c => !odByNorm.has(normTitle(c.title)))
  const missingGenuine = missing.filter(c => !odCompletedNorm.has(normTitle(c.title)))
  const missingFinishedUpstream = missing.filter(c => odCompletedNorm.has(normTitle(c.title)))
  const maxLag = lag.reduce((m, r) => Math.max(m, Math.abs((r.odEp ?? 0) - (r.nimeEp ?? 0))), 0)
  const staleCompleted = extra.filter(c => odCompletedNorm.has(normTitle(c.title)))
  const nipponKey = normTitle('Nippon Sangoku')
  const nipponInOngoing = nimeByNorm.has(nipponKey)
  const nipponInCompleted = nimeCompletedNorm.has(nipponKey)

  console.log(`[audit] OD ongoing: ${odOngoing.length} (${OD_ONGOING_PAGES} pages), Nimeplay ongoing: ${nimeOngoing.cards.length}`)
  console.log(`[audit] matched: ${matched}, missing from Nimeplay: ${missing.length} (genuine gap: ${missingGenuine.length}, finished upstream: ${missingFinishedUpstream.length}), extra in Nimeplay: ${extra.length}, max episode lag: ${maxLag}`)
  console.log('')
  console.log('Missing from Nimeplay (OD episode):')
  for (const m of missing) {
    const finishedMark = odCompletedNorm.has(normTitle(m.title)) ? ' [OD completed]' : ''
    console.log(`- ${m.title} (${m.episodeText})${finishedMark}`)
  }
  console.log('')
  console.log('Episode lag (OD vs Nimeplay):')
  const sortedLag = [...lag].sort((a, b) => Math.abs((b.odEp ?? 0) - (b.nimeEp ?? 0)) - Math.abs((a.odEp ?? 0) - (a.nimeEp ?? 0)))
  for (const r of sortedLag.slice(0, 30)) {
    console.log(`- ${r.title}: OD ep ${r.odEp} vs Nimeplay ep ${r.nimeEp}`)
  }
  console.log('')
  console.log('Extra in Nimeplay (not in OD ongoing):')
  for (const e of extra.slice(0, 30)) {
    const staleMark = odCompletedNorm.has(normTitle(e.title)) ? ' [OD completed, stale?]' : ''
    console.log(`- ${e.title} (${e.episode})${staleMark}`)
  }
  console.log('')
  console.log(`[audit] stale check: Nippon Sangoku ongoing=${nipponInOngoing} completed=${nipponInCompleted}`)
  if (staleCompleted.length > 0) {
    console.log(`[audit] stale candidates still ONGOING in Nimeplay but completed upstream: ${staleCompleted.length}`)
  }

  const success = missingGenuine.length === 0 && !nipponInOngoing && maxLag <= 1
  console.log('')
  console.log(JSON.stringify({
    odOngoing: odOngoing.length,
    nimeOngoing: nimeOngoing.cards.length,
    matched,
    missing: missing.length,
    missingGenuine: missingGenuine.length,
    missingFinishedUpstream: missingFinishedUpstream.length,
    extra: extra.length,
    maxLag,
    nipponInOngoing,
    nipponInCompleted,
    success,
  }, null, 2))
  if (!success) process.exitCode = 1
}

main().catch((error) => {
  console.error('[audit] fatal:', error instanceof Error ? error.message : error)
  process.exit(1)
})
