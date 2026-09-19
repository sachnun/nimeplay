DROP INDEX "anime_metadata_retry_at_idx";--> statement-breakpoint
DROP INDEX "anime_metadata_attempts_idx";--> statement-breakpoint
DROP INDEX "jobs_dedupe_key";--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_key" ON "jobs" USING btree ("dedupe_key") WHERE status in ('waiting', 'active', 'failed');--> statement-breakpoint
ALTER TABLE "anime" DROP COLUMN "metadata_attempts";--> statement-breakpoint
ALTER TABLE "anime" DROP COLUMN "metadata_last_error";--> statement-breakpoint
ALTER TABLE "anime" DROP COLUMN "metadata_retry_at";