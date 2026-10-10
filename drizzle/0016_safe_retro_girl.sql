ALTER TABLE "anime_sources" ADD COLUMN "metadata_state" text;--> statement-breakpoint
ALTER TABLE "anime_sources" ADD COLUMN "metadata_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "anime_sources" ADD COLUMN "metadata_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "anime_sources_metadata_state_idx" ON "anime_sources" USING btree ("metadata_state");