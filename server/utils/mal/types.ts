export interface MalCharacter {
  name: string
  imageUrl: string
  role: 'Main' | 'Supporting'
  voiceActor?: { name: string, imageUrl: string }
}

export interface MalSearchEntry {
  id: number
  title: string
  titles: string[]
  format?: string | null
  poster?: string | null
  score?: number | null
  popularity?: number | null
  season?: string | null
  year?: number | null
  genres?: string[]
}

export interface MalAnime {
  malId: number
  title: string
  titles: string[]
  poster: string | null
  synopsis: string
  score: number | null
  rank: number | null
  popularity: number | null
  status: 'ONGOING' | 'COMPLETED' | null
  season: string | null
  year: number | null
  trailerId: string | null
  studio: string | null
  source: string | null
  episodeTotal: number | null
  genres: string[]
  characters: MalCharacter[]
}
