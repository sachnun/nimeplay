import { z } from 'zod'

export const searchSchema = z.object({
  query: z.string(),
  genreSlug: z.string().optional(),
})

export const animePageSchema = z.object({
  status: z.enum(['ONGOING', 'COMPLETED']),
  page: z.number().int().min(1),
})

export const genrePageSchema = z.object({
  slug: z.string().min(1),
  page: z.number().int().min(1),
})

export const malIdSchema = z.object({ malId: z.number().int().min(0) })

export const episodeInfoSchema = z.object({
  malId: z.number().int().positive(),
  episodeNumber: z.number().int().positive(),
})

export const episodeStreamSchema = z.object({
  malId: z.number().int().positive(),
  episodeNumber: z.number().int().positive(),
  server: z.string().optional(),
  quality: z.string().optional(),
})
