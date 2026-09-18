CREATE TABLE "anime" (
	"slug" text PRIMARY KEY NOT NULL,
	"mal_id" integer,
	"title" text NOT NULL,
	"poster" text,
	"synopsis" text,
	"rating" real,
	"rank" integer,
	"popularity" integer,
	"season" text,
	"status" text,
	"type" text,
	"day" text,
	"studio" text,
	"source" text,
	"trailer_id" text,
	"characters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_url" text,
	"episode_count" integer DEFAULT 0 NOT NULL,
	"latest_episode" integer,
	"latest_episode_at" timestamp with time zone,
	"ongoing_rank" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata_synced_at" timestamp with time zone,
	"last_new_episode_at" timestamp with time zone,
	"metadata_attempts" integer DEFAULT 0 NOT NULL,
	"metadata_last_error" text,
	"metadata_retry_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "anime_genres" (
	"anime_slug" text NOT NULL,
	"genre_id" integer NOT NULL,
	CONSTRAINT "anime_genres_anime_slug_genre_id_pk" PRIMARY KEY("anime_slug","genre_id")
);
--> statement-breakpoint
CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"anime_slug" text NOT NULL,
	"slug" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"release_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "genres_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "anime_genres" ADD CONSTRAINT "anime_genres_anime_slug_anime_slug_fk" FOREIGN KEY ("anime_slug") REFERENCES "public"."anime"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_genres" ADD CONSTRAINT "anime_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_anime_slug_anime_slug_fk" FOREIGN KEY ("anime_slug") REFERENCES "public"."anime"("slug") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anime_mal_id_key" ON "anime" USING btree ("mal_id");--> statement-breakpoint
CREATE INDEX "anime_title_idx" ON "anime" USING btree ("title");--> statement-breakpoint
CREATE INDEX "anime_updated_at_idx" ON "anime" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "anime_latest_episode_at_idx" ON "anime" USING btree ("latest_episode_at");--> statement-breakpoint
CREATE INDEX "anime_status_idx" ON "anime" USING btree ("status");--> statement-breakpoint
CREATE INDEX "anime_status_mal_id_idx" ON "anime" USING btree ("status","mal_id");--> statement-breakpoint
CREATE INDEX "anime_metadata_retry_at_idx" ON "anime" USING btree ("metadata_retry_at");--> statement-breakpoint
CREATE INDEX "anime_metadata_attempts_idx" ON "anime" USING btree ("metadata_attempts");--> statement-breakpoint
CREATE INDEX "anime_fts_idx" ON "anime" USING gin (to_tsvector('simple', "title"));--> statement-breakpoint
CREATE INDEX "anime_genres_genre_id_idx" ON "anime_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_anime_slug_number_key" ON "episodes" USING btree ("anime_slug","number");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_slug_key" ON "episodes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "episodes_anime_slug_idx" ON "episodes" USING btree ("anime_slug");