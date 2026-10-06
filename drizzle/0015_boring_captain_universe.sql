ALTER TABLE "anime" ADD COLUMN "search_doc" "tsvector";--> statement-breakpoint
CREATE INDEX "anime_search_doc_idx" ON "anime" USING gin ("search_doc");--> statement-breakpoint
UPDATE "anime" a SET "search_doc" =
  setweight(to_tsvector('simple', coalesce(a.title, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce((
    select string_agg(t.value, ' ') from jsonb_array_elements_text(a.extra -> 'titles') t(value)
  ), '')), 'A') ||
  setweight(to_tsvector('simple', concat_ws(' ', a.studio, a.type)), 'B') ||
  setweight(to_tsvector('simple', coalesce((
    select string_agg(g.name, ' ') from anime_genres ag join genres g on g.id = ag.genre_id where ag.anime_id = a.id
  ), '')), 'C') ||
  setweight(to_tsvector('simple', coalesce((
    select string_agg(ch.name || ' ' || coalesce(ch.voice_actor_name, ''), ' ') from characters ch where ch.anime_id = a.id
  ), '')), 'C') ||
  setweight(to_tsvector('simple', coalesce(a.synopsis, '')), 'D');
