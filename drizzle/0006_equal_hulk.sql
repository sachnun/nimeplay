ALTER TABLE "episodes" ADD COLUMN "cache" jsonb;--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "cached_at" timestamp with time zone;