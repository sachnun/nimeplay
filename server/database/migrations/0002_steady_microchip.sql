ALTER TABLE "anime" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
UPDATE "anime" SET "title" = NULL WHERE "metadata_synced_at" IS NULL;
