DROP INDEX "jobs_dedupe_key";--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_dedupe_key" ON "jobs" USING btree ("dedupe_key") WHERE status in ('waiting', 'active');--> statement-breakpoint
UPDATE "jobs"
SET "status" = 'dead',
    "run_at" = now() + CASE
      WHEN "last_error" ~ 'episode data unavailable' OR "last_error" ~ 'Failed to fetch [^ ]*: 4[0-9][0-9]'
        THEN interval '7 days'
      ELSE interval '6 hours'
    END,
    "locked_at" = NULL,
    "locked_by" = NULL,
    "updated_at" = now()
WHERE "status" = 'failed';