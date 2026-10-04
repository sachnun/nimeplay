ALTER TABLE "anime" ALTER COLUMN "day" SET DATA TYPE integer USING (
  case lower(btrim("day"))
    when 'senin' then 0
    when 'selasa' then 1
    when 'rabu' then 2
    when 'kamis' then 3
    when 'jumat' then 4
    when 'sabtu' then 5
    when 'minggu' then 6
    else null
  end
);--> statement-breakpoint
ALTER TABLE "anime_sources" DROP COLUMN "day";
