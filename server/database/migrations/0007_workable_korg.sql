CREATE TABLE "anime_sources" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"anime_id" bigint,
	"source" text NOT NULL,
	"slug" text NOT NULL,
	"url" text,
	"status" text,
	"day" text,
	"ongoing_rank" integer,
	"latest_episode_at" timestamp with time zone,
	"metadata_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anime_sources" ADD CONSTRAINT "anime_sources_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "anime_sources" ("anime_id", "source", "slug", "url", "status", "day", "ongoing_rank", "latest_episode_at", "metadata_synced_at", "created_at", "updated_at")
SELECT "id", split_part("slug", ':', 1), substring("slug" from position(':' in "slug") + 1), "source_url", "status", "day", "ongoing_rank", "latest_episode_at", "metadata_synced_at", "created_at", "updated_at"
FROM "anime";--> statement-breakpoint
ALTER TABLE "episodes" ADD COLUMN "source_id" bigint;--> statement-breakpoint
UPDATE "episodes" e SET "source_id" = s."id" FROM "anime_sources" s WHERE s."anime_id" = e."anime_id";--> statement-breakpoint
ALTER TABLE "episodes" ALTER COLUMN "source_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_source_id_anime_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."anime_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" DROP CONSTRAINT "episodes_anime_id_anime_id_fk";--> statement-breakpoint
DROP INDEX "episodes_anime_id_number_key";--> statement-breakpoint
DROP INDEX "episodes_anime_id_idx";--> statement-breakpoint
ALTER TABLE "episodes" DROP COLUMN "anime_id";--> statement-breakpoint
UPDATE "anime_sources" SET "anime_id" = NULL WHERE "anime_id" IN (SELECT "id" FROM "anime" WHERE "mal_id" IS NULL);--> statement-breakpoint
DELETE FROM "anime" WHERE "mal_id" IS NULL;--> statement-breakpoint
ALTER TABLE "anime" DROP CONSTRAINT "anime_slug_unique";--> statement-breakpoint
ALTER TABLE "anime" DROP COLUMN "slug";--> statement-breakpoint
ALTER TABLE "anime" DROP COLUMN "source_url";--> statement-breakpoint
ALTER TABLE "anime" ALTER COLUMN "mal_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "anime_sources_source_slug_key" ON "anime_sources" USING btree ("source","slug");--> statement-breakpoint
CREATE INDEX "anime_sources_anime_id_idx" ON "anime_sources" USING btree ("anime_id");--> statement-breakpoint
CREATE INDEX "anime_sources_status_idx" ON "anime_sources" USING btree ("status");--> statement-breakpoint
CREATE INDEX "anime_sources_updated_at_idx" ON "anime_sources" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_source_id_number_key" ON "episodes" USING btree ("source_id","number");--> statement-breakpoint
CREATE INDEX "episodes_source_id_idx" ON "episodes" USING btree ("source_id");
