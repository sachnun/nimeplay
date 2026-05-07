CREATE TYPE "public"."anime_kind" AS ENUM('ONGOING', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."sync_run_status" AS ENUM('RUNNING', 'SUCCESS', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."sync_run_type" AS ENUM('LATEST', 'CATALOG');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('PENDING', 'SYNCED', 'FAILED');--> statement-breakpoint
CREATE TABLE "anime_episodes" (
	"slug" text PRIMARY KEY NOT NULL,
	"anime_slug" text NOT NULL,
	"title" text NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"episode_number" integer,
	"sort_order" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anime_genres" (
	"anime_slug" text NOT NULL,
	"genre_slug" text NOT NULL,
	CONSTRAINT "anime_genres_anime_slug_genre_slug_pk" PRIMARY KEY("anime_slug","genre_slug")
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "latest_feed_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "anime_kind" NOT NULL,
	"anime_slug" text NOT NULL,
	"position" integer NOT NULL,
	"episode" text DEFAULT '' NOT NULL,
	"day" text DEFAULT '' NOT NULL,
	"date" text DEFAULT '' NOT NULL,
	"rating" text DEFAULT '' NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mal_anime" (
	"mal_id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"title_english" text,
	"title_japanese" text,
	"synopsis" text,
	"background" text,
	"image_url" text DEFAULT '' NOT NULL,
	"trailer_embed_url" text,
	"score" text DEFAULT '' NOT NULL,
	"rank" integer,
	"popularity" integer,
	"rating" text DEFAULT '' NOT NULL,
	"season" text,
	"year" integer,
	"type" text DEFAULT '' NOT NULL,
	"status" text DEFAULT '' NOT NULL,
	"episodes" integer,
	"duration" text DEFAULT '' NOT NULL,
	"studios" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"characters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otakudesu_anime" (
	"slug" text PRIMARY KEY NOT NULL,
	"mal_id" integer,
	"raw_title" text NOT NULL,
	"title" text NOT NULL,
	"japanese_title" text DEFAULT '' NOT NULL,
	"source_synopsis" text DEFAULT '' NOT NULL,
	"source_score" text DEFAULT '' NOT NULL,
	"source_producer" text DEFAULT '' NOT NULL,
	"source_type" text DEFAULT '' NOT NULL,
	"source_status" text DEFAULT '' NOT NULL,
	"source_total_episode" text DEFAULT '' NOT NULL,
	"source_duration" text DEFAULT '' NOT NULL,
	"source_release_date" text DEFAULT '' NOT NULL,
	"source_studio" text DEFAULT '' NOT NULL,
	"latest_episode" text DEFAULT '' NOT NULL,
	"latest_day" text DEFAULT '' NOT NULL,
	"latest_date" text DEFAULT '' NOT NULL,
	"latest_rating" text DEFAULT '' NOT NULL,
	"is_ongoing" boolean DEFAULT false NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"sync_status" "sync_status" DEFAULT 'PENDING' NOT NULL,
	"sync_error" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "sync_run_type" NOT NULL,
	"status" "sync_run_status" DEFAULT 'RUNNING' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"processed" integer DEFAULT 0 NOT NULL,
	"succeeded" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"message" text
);
--> statement-breakpoint
ALTER TABLE "anime_episodes" ADD CONSTRAINT "anime_episodes_anime_slug_otakudesu_anime_slug_fk" FOREIGN KEY ("anime_slug") REFERENCES "public"."otakudesu_anime"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_genres" ADD CONSTRAINT "anime_genres_anime_slug_otakudesu_anime_slug_fk" FOREIGN KEY ("anime_slug") REFERENCES "public"."otakudesu_anime"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_genres" ADD CONSTRAINT "anime_genres_genre_slug_genres_slug_fk" FOREIGN KEY ("genre_slug") REFERENCES "public"."genres"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "latest_feed_items" ADD CONSTRAINT "latest_feed_items_anime_slug_otakudesu_anime_slug_fk" FOREIGN KEY ("anime_slug") REFERENCES "public"."otakudesu_anime"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otakudesu_anime" ADD CONSTRAINT "otakudesu_anime_mal_id_mal_anime_mal_id_fk" FOREIGN KEY ("mal_id") REFERENCES "public"."mal_anime"("mal_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anime_episodes_anime_idx" ON "anime_episodes" USING btree ("anime_slug");--> statement-breakpoint
CREATE INDEX "anime_episodes_anime_order_idx" ON "anime_episodes" USING btree ("anime_slug","sort_order");--> statement-breakpoint
CREATE INDEX "anime_genres_genre_idx" ON "anime_genres" USING btree ("genre_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "latest_feed_kind_anime_unique" ON "latest_feed_items" USING btree ("kind","anime_slug");--> statement-breakpoint
CREATE INDEX "latest_feed_kind_position_idx" ON "latest_feed_items" USING btree ("kind","position");--> statement-breakpoint
CREATE INDEX "mal_anime_title_idx" ON "mal_anime" USING btree ("title");--> statement-breakpoint
CREATE INDEX "otakudesu_anime_mal_idx" ON "otakudesu_anime" USING btree ("mal_id");--> statement-breakpoint
CREATE INDEX "otakudesu_anime_title_idx" ON "otakudesu_anime" USING btree ("title");--> statement-breakpoint
CREATE INDEX "otakudesu_anime_synced_idx" ON "otakudesu_anime" USING btree ("sync_status");