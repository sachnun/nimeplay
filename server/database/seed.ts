import { eq, inArray, sql } from 'drizzle-orm'
import { anime, animeGenres, animeSources, characters, episodes, genres } from './schema'
import { db } from '../utils/db'
import { registerNeonDatabase } from '../utils/db/neon'

registerNeonDatabase()

const PREFIX = 'seed:'
const MAL_BASE = 900000
const COUNT = 60

interface SeedCharacter {
  name: string
  role: 'Main' | 'Supporting'
  voiceActor?: string
}

interface SeedAnime {
  slug: string
  title: string
  synopsis: string
  rating: number
  season: 'winter' | 'spring' | 'summer' | 'fall'
  year: number
  status: 'ONGOING' | 'COMPLETED'
  type: string
  day?: string
  studio: string
  source: string
  start: string
  episodes: number
  genres: string[]
  characters: SeedCharacter[]
}

function mulberry32(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6D2B79F5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(0x5EEDCAFE)

function int(min: number, max: number): number {
  return min + Math.floor(rand() * (max - min + 1))
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rand() * items.length)]!
}

function pickMany<T>(items: readonly T[], min: number, max: number): T[] {
  const count = int(min, max)
  const pool = [...items]
  const picked: T[] = []
  while (picked.length < count && pool.length > 0) {
    picked.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!)
  }
  return picked
}

const adjectives = ['Crimson', 'Silent', 'Eternal', 'Broken', 'Sacred', 'Hollow', 'Radiant', 'Frozen', 'Burning', 'Lost', 'Golden', 'Midnight', 'Iron', 'Violet', 'Endless', 'Shattered', 'Hidden', 'Wandering', 'Azure', 'Scarlet']
const nouns = ['Blade', 'Requiem', 'Horizon', 'Garden', 'Symphony', 'Chronicle', 'Sky', 'Echo', 'Dream', 'Empire', 'Wanderer', 'Promise', 'Alchemist', 'Reaper', 'Academy', 'Odyssey', 'Lament', 'Covenant', 'Paradox', 'Nexus']
const tails = ['Dawn', 'Abyss', 'Fallen', 'Void', 'Stars', 'Storm', 'King', 'Witch', 'Moon', 'Dust']
const subtitles = ['Requiem', 'Rebirth', 'Zero', 'Aftermath', 'Legacy', 'Protocol', 'Rising', 'Fall']
const suffixes = ['Academy', 'Chronicles', 'Project', 'Saga', 'Frontier', 'Society', 'Experiment', 'Crusade']
const genrePool = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Sci-Fi', 'Supernatural', 'Horror', 'Mystery', 'Psychological', 'Thriller', 'Romance', 'Slice of Life', 'Sports', 'Music', 'Mecha', 'Isekai', 'Shounen']
const studios = ['Madhouse', 'MAPPA', 'ufotable', 'Bones', 'Wit Studio', 'A-1 Pictures', 'White Fox', 'Production I.G', 'Kyoto Animation', 'CloverWorks', 'Trigger', 'Shaft', 'J.C.Staff', 'Studio Pierrot']
const sources = ['Manga', 'Light Novel', 'Web Novel', 'Original', 'Visual Novel', 'Web Comic', 'Manhwa']
const days = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
const givenNames = ['Haru', 'Akira', 'Yuki', 'Rin', 'Sora', 'Kaito', 'Mei', 'Ren', 'Hina', 'Sota', 'Aoi', 'Itsuki', 'Nao', 'Takumi', 'Emi', 'Kohaku', 'Shion', 'Ayaka', 'Daichi', 'Mio']
const familyNames = ['Tanaka', 'Suzuki', 'Sato', 'Yamada', 'Kobayashi', 'Ishikawa', 'Fujimoto', 'Nakamura', 'Hayashi', 'Mori', 'Okada', 'Shimizu', 'Kuroda', 'Sakamoto', 'Nishimura', 'Hasegawa', 'Aoyama', 'Yoshida', 'Kawasaki', 'Matsuda']

function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function image(seed: string, width: number, height: number): string {
  return `https://picsum.photos/seed/nimeplay-${seed}/${width}/${height}`
}

function episodeDate(start: string, number: number): string {
  const date = new Date(`${start}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + (number - 1) * 7)
  return date.toISOString().slice(0, 10)
}

function seasonOf(month: number): SeedAnime['season'] {
  if (month <= 3) return 'winter'
  if (month <= 6) return 'spring'
  if (month <= 9) return 'summer'
  return 'fall'
}

function buildTitle(used: Set<string>): string {
  for (let attempt = 0; attempt < 200; attempt++) {
    const style = int(0, 3)
    const title = style === 0
      ? `${pick(adjectives)} ${pick(nouns)}`
      : style === 1
        ? `${pick(nouns)} of the ${pick(tails)}`
        : style === 2
          ? `${pick(adjectives)} ${pick(nouns)}: ${pick(subtitles)}`
          : `${pick(nouns)} ${pick(suffixes)}`
    if (!used.has(title)) {
      used.add(title)
      return title
    }
  }
  return `Untitled ${used.size + 1}`
}

function buildCharacters(): SeedCharacter[] {
  const count = int(2, 6)
  const used = new Set<string>()
  const roster: SeedCharacter[] = []
  for (let index = 0; index < count; index++) {
    let name = `${pick(givenNames)} ${pick(familyNames)}`
    while (used.has(name)) name = `${pick(givenNames)} ${pick(familyNames)}`
    used.add(name)
    roster.push({
      name,
      role: index < 2 ? 'Main' : 'Supporting',
      voiceActor: `${pick(givenNames)} ${pick(familyNames)}`,
    })
  }
  return roster
}

function buildCatalog(count: number): SeedAnime[] {
  const usedTitles = new Set<string>()
  const usedSlugs = new Set<string>()
  const catalog: SeedAnime[] = []
  for (let index = 0; index < count; index++) {
    const title = buildTitle(usedTitles)
    let slug = slugify(title)
    if (usedSlugs.has(slug)) slug = `${slug}-${index + 1}`
    usedSlugs.add(slug)

    const month = int(1, 12)
    const day = int(1, 28)
    const year = int(2015, 2025)
    const status: SeedAnime['status'] = rand() < 0.6 ? 'ONGOING' : 'COMPLETED'
    const genres = pickMany(genrePool, 2, 4)

    catalog.push({
      slug,
      title,
      synopsis: `${title} follows a cast of unlikely allies as they face ${genres.join(' and ').toLowerCase()} trials, uncovering a conspiracy that could reshape their world.`,
      rating: Number((6 + rand() * 3.5).toFixed(1)),
      season: seasonOf(month),
      year,
      status,
      type: 'TV',
      day: status === 'ONGOING' ? pick(days) : undefined,
      studio: pick(studios),
      source: pick(sources),
      start: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      episodes: status === 'ONGOING' ? int(6, 24) : int(12, 64),
      genres,
      characters: buildCharacters(),
    })
  }
  return catalog
}

const CATALOG = buildCatalog(COUNT)

function animeValues(entry: SeedAnime, malId: number): typeof anime.$inferInsert {
  const last = episodeDate(entry.start, entry.episodes)
  return {
    malId,
    title: entry.title,
    posterKey: image(entry.slug, 460, 650),
    synopsis: entry.synopsis,
    rating: entry.rating,
    season: entry.season,
    year: entry.year,
    status: entry.status,
    type: entry.type,
    day: entry.status === 'ONGOING' ? entry.day ?? null : null,
    studio: entry.studio,
    source: entry.source,
    episodeCount: entry.episodes,
    latestEpisode: entry.episodes,
    latestEpisodeAt: new Date(`${last}T00:00:00Z`),
    lastNewEpisodeAt: entry.status === 'ONGOING' ? new Date(`${last}T00:00:00Z`) : null,
    ongoingRank: entry.status === 'ONGOING' ? malId - MAL_BASE : null,
    metadataSyncedAt: new Date(),
    extra: { episodeTotal: entry.episodes },
    updatedAt: new Date(),
  }
}

function episodeValues(entry: SeedAnime, sourceId: number): (typeof episodes.$inferInsert)[] {
  return Array.from({ length: entry.episodes }, (_, index) => {
    const number = index + 1
    return {
      sourceId,
      slug: `${PREFIX}${entry.slug}:ep${number}`,
      number,
      title: `Episode ${number}`,
      releaseDate: episodeDate(entry.start, number),
    }
  })
}

function characterValues(entry: SeedAnime, animeId: number): (typeof characters.$inferInsert)[] {
  return entry.characters.map((character, index) => ({
    animeId,
    malId: null,
    name: character.name,
    role: character.role,
    imageKey: image(`${entry.slug}-${slugify(character.name)}`, 225, 319),
    voiceActorName: character.voiceActor ?? null,
    voiceActorKey: character.voiceActor ? image(`${entry.slug}-${slugify(character.voiceActor)}`, 225, 319) : null,
    sortOrder: index,
  }))
}

async function seed(): Promise<void> {
  const client = db()

  const genreNames = [...new Set(CATALOG.flatMap(entry => entry.genres))]
  const genreSlugs = genreNames.map(slugify)
  await client
    .insert(genres)
    .values(genreNames.map(name => ({ slug: slugify(name), name })))
    .onConflictDoUpdate({ target: genres.slug, set: { updatedAt: new Date() } })
  const genreRows = await client
    .select({ id: genres.id, slug: genres.slug })
    .from(genres)
    .where(inArray(genres.slug, genreSlugs))
  const genreIds = new Map(genreRows.map(row => [row.slug, row.id]))

  await client.execute(sql`delete from anime where id in (select anime_id from anime_sources where source = 'seed' and anime_id is not null)`)

  for (const [index, entry] of CATALOG.entries()) {
    const malId = MAL_BASE + index + 1
    const values = animeValues(entry, malId)
    const [stored] = await client
      .insert(anime)
      .values(values)
      .onConflictDoUpdate({ target: anime.malId, set: values })
      .returning({ id: anime.id })
    if (!stored) throw new Error(`failed to upsert ${entry.slug}`)
    const animeId = stored.id

    const [storedSource] = await client
      .insert(animeSources)
      .values({
        animeId,
        source: 'seed',
        slug: entry.slug,
        status: entry.status,
        day: entry.status === 'ONGOING' ? entry.day ?? null : null,
        ongoingRank: entry.status === 'ONGOING' ? malId - MAL_BASE : null,
        latestEpisodeAt: values.latestEpisodeAt ?? null,
      })
      .onConflictDoUpdate({ target: [animeSources.source, animeSources.slug], set: { animeId } })
      .returning({ id: animeSources.id })
    const sourceId = storedSource!.id

    await client.delete(animeGenres).where(eq(animeGenres.animeId, animeId))
    const links = entry.genres
      .map(name => ({ animeId, genreId: genreIds.get(slugify(name)) }))
      .filter((link): link is { animeId: number, genreId: number } => link.genreId !== undefined)
    if (links.length > 0) await client.insert(animeGenres).values(links).onConflictDoNothing()

    await client.delete(episodes).where(eq(episodes.sourceId, sourceId))
    await client.insert(episodes).values(episodeValues(entry, sourceId))

    await client.delete(characters).where(eq(characters.animeId, animeId))
    const characterRows = characterValues(entry, animeId)
    if (characterRows.length > 0) await client.insert(characters).values(characterRows)
  }

  const episodeTotal = CATALOG.reduce((total, entry) => total + entry.episodes, 0)
  const characterTotal = CATALOG.reduce((total, entry) => total + entry.characters.length, 0)
  console.log(`[seed] ${CATALOG.length} anime, ${genreNames.length} genres, ${episodeTotal} episodes, ${characterTotal} characters`)
}

try {
  process.loadEnvFile('.env.local')
}
catch {}

if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error('[seed] refusing to run with NODE_ENV=production; pass --force to override')
  process.exit(1)
}

if (process.argv.includes('--dry-run')) {
  for (const entry of CATALOG) console.log(`${entry.slug}\t${entry.status}\t${entry.episodes}\t${entry.title}`)
  console.log(`[seed] dry run: ${CATALOG.length} anime, ${new Set(CATALOG.flatMap(entry => entry.genres)).size} genres`)
  process.exit(0)
}

seed().catch((error) => {
  console.error('[seed] failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
