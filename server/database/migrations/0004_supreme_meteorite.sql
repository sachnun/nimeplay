DROP INDEX "media_status_idx";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "content_type";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "byte_size";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "attempts";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "last_error";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "mirrored_at";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "next_retry_at";--> statement-breakpoint
ALTER TABLE "media" DROP COLUMN "updated_at";