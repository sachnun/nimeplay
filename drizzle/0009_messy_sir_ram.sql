CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "anime_title_trgm_idx" ON "anime" USING gin ("title" gin_trgm_ops);