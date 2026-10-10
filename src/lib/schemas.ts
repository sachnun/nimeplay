import { z } from 'zod'

export const searchSchema = z.string()

export const animePageSchema = z.object({
  status: z.enum(['ONGOING', 'COMPLETED']),
  page: z.number().int().min(1),
})

export const genrePageSchema = z.object({
  slug: z.string().min(1),
  page: z.number().int().min(1),
})

export const malIdSchema = z.object({ malId: z.number().int().min(0) })

export const episodeSchema = z.object({
  malId: z.number().int().positive(),
  episodeNumber: z.number().int().positive(),
  server: z.string().optional(),
  quality: z.string().optional(),
  stream: z.boolean().default(true),
})
