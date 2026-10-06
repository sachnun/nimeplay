CREATE TABLE "anime" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"mal_id" integer,
	"title" text NOT NULL,
	"poster_key" text,
	"synopsis" text,
	"rating" real,
	"rank" integer,
	"popularity" integer,
	"season" text,
	"year" integer,
	"status" text,
	"type" text,
	"day" text,
	"studio" text,
	"source" text,
	"trailer_id" text,
	"source_url" text,
	"episode_count" integer DEFAULT 0 NOT NULL,
	"latest_episode" integer,
	"latest_episode_at" timestamp with time zone,
	"ongoing_rank" integer,
	"metadata_synced_at" timestamp with time zone,
	"metadata_attempts" integer DEFAULT 0 NOT NULL,
	"metadata_last_error" text,
	"metadata_retry_at" timestamp with time zone,
	"last_new_episode_at" timestamp with time zone,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "anime_genres" (
	"anime_id" bigint NOT NULL,
	"genre_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "anime_genres_anime_id_genre_id_pk" PRIMARY KEY("anime_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "app_state" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"anime_id" bigint NOT NULL,
	"mal_id" integer,
	"name" text NOT NULL,
	"role" text,
	"image_key" text,
	"voice_actor_name" text,
	"voice_actor_key" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "episodes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"anime_id" bigint NOT NULL,
	"slug" text NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"release_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "genres_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "media" (
	"key" text PRIMARY KEY NOT NULL,
	"source_url" text NOT NULL,
	"content_type" text,
	"byte_size" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"mirrored_at" timestamp with time zone,
	"next_retry_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "anime_genres" ADD CONSTRAINT "anime_genres_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anime_genres" ADD CONSTRAINT "anime_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_anime_id_anime_id_fk" FOREIGN KEY ("anime_id") REFERENCES "public"."anime"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "anime_mal_id_key" ON "anime" USING btree ("mal_id");--> statement-breakpoint
CREATE INDEX "anime_title_idx" ON "anime" USING btree ("title");--> statement-breakpoint
CREATE INDEX "anime_updated_at_idx" ON "anime" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "anime_latest_episode_at_idx" ON "anime" USING btree ("latest_episode_at");--> statement-breakpoint
CREATE INDEX "anime_status_idx" ON "anime" USING btree ("status");--> statement-breakpoint
CREATE INDEX "anime_status_mal_id_idx" ON "anime" USING btree ("status","mal_id");--> statement-breakpoint
CREATE INDEX "anime_metadata_retry_at_idx" ON "anime" USING btree ("metadata_retry_at");--> statement-breakpoint
CREATE INDEX "anime_metadata_attempts_idx" ON "anime" USING btree ("metadata_attempts");--> statement-breakpoint
CREATE INDEX "anime_season_year_idx" ON "anime" USING btree ("season","year");--> statement-breakpoint
CREATE INDEX "anime_fts_idx" ON "anime" USING gin (to_tsvector('simple', "title"));--> statement-breakpoint
CREATE INDEX "anime_genres_genre_id_idx" ON "anime_genres" USING btree ("genre_id");--> statement-breakpoint
CREATE UNIQUE INDEX "characters_anime_id_name_key" ON "characters" USING btree ("anime_id","name");--> statement-breakpoint
CREATE INDEX "characters_anime_id_idx" ON "characters" USING btree ("anime_id");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_anime_id_number_key" ON "episodes" USING btree ("anime_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "episodes_slug_key" ON "episodes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "episodes_anime_id_idx" ON "episodes" USING btree ("anime_id");--> statement-breakpoint
CREATE INDEX "media_status_idx" ON "media" USING btree ("status","next_retry_at");