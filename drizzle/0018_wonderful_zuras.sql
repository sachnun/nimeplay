CREATE TABLE "source_stats" (
	"server" text NOT NULL,
	"quality" text NOT NULL,
	"alpha" double precision DEFAULT 1 NOT NULL,
	"beta" double precision DEFAULT 1 NOT NULL,
	"samples" bigint DEFAULT 0 NOT NULL,
	"speed_bps" double precision DEFAULT 0 NOT NULL,
	"ttf_ms" double precision DEFAULT 0 NOT NULL,
	"last_ok_at" timestamp with time zone,
	"last_fail_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_stats_server_quality_pk" PRIMARY KEY("server","quality")
);
create or replace function decayed(
  value double precision,
  at timestamptz,
  half_life_s double precision
) returns double precision
language sql
stable
as $$
  select value * exp(-0.6931471805599453 * greatest(extract(epoch from (now() - at)), 0) / greatest(half_life_s, 1))
$$;
