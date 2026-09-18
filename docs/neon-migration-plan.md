# Nimeplay: D1 + R2 + KV to Neon (Postgres, Object Storage, Functions)

## Goal

Replace all Cloudflare storage bindings (`DB` D1, `CACHE` KV, `R2`) with Neon:

- **Postgres** for relational data (was D1)
- **Object Storage** for media (was R2)
- **KV is deleted**, not replaced
- **DB-facing API runs on Neon Functions** (Node 24, next to Postgres)
- **Streaming stays on Cloudflare** (Nuxt on Workers)
- Frontend stays on Cloudflare Workers

## Target architecture

```
Browser
  ├─ SSR/UI + /api/stream + /api/mirror/prepare ─▶ Cloudflare Worker (Nuxt)
  │                                                    └─ Vue/H3 only, no pg
  └─ data API (api.<domain>) ────────────────────▶ Neon Function (Hono, Node 24)
                                                       ├─ Postgres    (pg Pool + Drizzle)
                                                       ├─ Object Storage (S3 API)
                                                       └─ scheduled Triggers (cron)
```

| Concern | Today | Target |
| --- | --- | --- |
| Relational data | D1 (`drizzle-orm/d1`) | Neon Postgres, `drizzle-orm/node-postgres` + `pg` Pool |
| Media | R2 bucket `nimeplay` | Neon Object Storage `public_read` bucket |
| Hot cache | KV + in-memory `Map` | per-process in-memory `Map` (Worker isolate + Function isolate) |
| Durable side state | KV | Postgres `app_state` |
| Catalog cron | CF cron → Worker | Neon Function Trigger (schedule, `0 */3 * * *`) |
| DB API | Nuxt server routes on Worker | Hono app on a Neon Function |
| Stream proxy | Worker `/api/stream` | unchanged |

Neon Functions run Node.js 24, bundle with esbuild, inject `DATABASE_URL`,
`DATABASE_URL_UNPOOLED`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`AWS_ENDPOINT_URL_S3`, `AWS_REGION` from the branch. They are not full-stack hosting,
so only the API moves; the Nuxt UI + streaming stays on Workers.

## Endpoint routing

The rule: **anything that opens Postgres or Object Storage lives on the Function.
Anything that proxies/derives a media stream lives on the Worker.**

| Route | Host | Why |
| --- | --- | --- |
| `GET /api/v1/anime`, `/api/v1/anime/:malId`, `/api/v1/genres`, `/api/v1/genre/:slug` | Function | pure Postgres |
| `GET /api/home`, `/api/search`, `/api/anime-page`, `/api/genre/:slug`, `/api/anime/:malId`, `/api/anime/metadata` | Function | pure Postgres |
| `GET /api/anime/:malId/:episode/meta` | Function | pure Postgres (episode resolve + episode list) |
| `GET /api/internal/catalog-health` | Function | Postgres |
| `POST /internal/cron/catalog-sync`, `/internal/cron/metadata-sync` | Function Trigger | scrape + Postgres + Object Storage writes |
| `GET /openapi.json`, `/docs` | Function | API reference lives with the API |
| `POST /api/mirror/prepare` | Worker | embed resolve + stream extraction |
| `GET /api/stream` | Worker | HLS/file byte proxy, stream token |
| `GET /api/anime/:malId/:episode`, `GET /api/v1/anime/:malId/:episode` | Worker | calls Function `/meta`, then scrapes + prepares locally |
| `GET /r2/[...key]` | Worker | 302 to Object Storage public URL, fallback to MAL CDN |

`/api/v1/anime/:malId/:episode` (the public "watch" endpoint) returns `stream.playUrl`,
and `playUrl` must point at the **Worker** `/api/stream`. So `prepareMirror` and the
sealed token stay on the Worker. The public API is therefore split across two origins;
the Function docs cover the data endpoints and link the watch endpoint to the web origin.

## Repository layout

Extract the framework-free modules so both runtimes share them, and keep thin H3
wrappers for the Worker. This is also the natural fallout of removing KV: once
`cache.get`/`refresh` no longer take an `H3Event`, the data layer has no H3 coupling.

```
shared/
  sources/            scrapers (otakudesu, sokuja, animein, ylnime, shared)
  extractors/         embed -> direct url
  mal.ts  synopsis.ts  spoof.ts  fts.ts
  streamUrl.ts  prepare.ts      (Worker)
  media.ts                      Object Storage client (Function writes, Worker reads)
  cache.ts                      framework-free in-memory Map
server/
  database/           schema.ts + Postgres migrations (removed from Nitro build)
  api/                only: stream.ts, mirror/prepare.post.ts,
                      anime/[malId]/[episode].get.ts, r2/[...key].get.ts
  utils/              H3 wrappers: internal.ts, queries.ts (delegates), stream.ts
functions/
  api/
    index.ts          Hono app: data endpoints + /openapi.json + /docs
    db.ts             pg Pool + drizzle(pool)
    routes/           anime.ts, genre.ts, home.ts, search.ts, metadata.ts, episode-meta.ts
    cron.ts           catalog-sync + metadata-sync workers, app_state cursor
neon.ts               functions + buckets + triggers + customDomain
wrangler.jsonc        Worker only (no d1/kv/r2 bindings)
```

## Workstreams

### 1. Function: Postgres + Drizzle

- `functions/api/db.ts`: one `pg` `Pool` at module scope, `attachDatabasePool(pool)`
  from `@neon/functions`, `max: 5`, `drizzle(pool, { schema })` with
  `drizzle-orm/node-postgres`. Use pooled `DATABASE_URL`; `DATABASE_URL_UNPOOLED` only
  for migrations.
- `functions/api/index.ts`: Hono app with `cors()`, `secureHeaders()`, a required
  `x-nimeplay-key` guard on `/internal/*`, the data routes, and `/docs` + `/openapi.json`
  (`@hono/zod-openapi` + `@scalar/hono-api-reference`). `cron.ts` verifies the
  `X-Neon-Trigger-Invocation-Id` header (Neon strips client-set `X-Neon-*`).
- Deps: `hono`, `@neon/functions`, `pg`, `@types/pg`, `drizzle-orm`,
  `@aws-sdk/client-s3` (or `aws4fetch`), `@neon/config` (dev).

### 2. Worker: strip the database

- Delete from the Worker: `server/utils/db.ts`, all `server/api/**` data routes,
  `server/utils/queries.ts` + `refresh.ts` DB paths, Nitro `experimental.openAPI`.
- Keep: `server/api/stream.ts`, `server/api/mirror/prepare.post.ts`,
  `server/api/anime/[malId]/[episode].get.ts` (delegates DB to the Function),
  `server/api/v1/anime/[malId]/[episode].get.ts`, `server/routes/r2/[...key].get.ts`.
- `server/api/anime/[malId]/[episode].get.ts`: replace `resolveEpisode` +
  `getEpisodeNumbers` with `fetch(`${config.apiBase}/api/anime/:malId/:episode/meta`)`.
- `wrangler.jsonc`: drop `d1_databases`, `kv_namespaces`, `r2_buckets`; keep
  `triggers` optional (cron now belongs to the Function Trigger); add `vars` for
  `API_BASE` if the Worker needs it.

### 3. Frontend: API base

- Add `runtimeConfig.public.apiBase` (default `https://api.<domain>`, overridable via
  `NUXT_PUBLIC_API_BASE`).
- Replace DB-bound fetches with `apiUrl(path)`:
  `app/pages/index.vue` (`/api/home`), `app/pages/anime/[malId].vue`,
  `app/pages/[genreSlug].vue`, `app/pages/history.vue`,
  `app/components/{AnimeInfiniteGrid,GenreAnimeGrid,SearchBar,EpisodeList}.vue`,
  `app/utils/remote.ts`.
- Keep relative: `/api/anime/:malId/:episode`, `/api/mirror/prepare` (Worker).
- Function `cors()` allows the site origin so browser calls work post-hydration.

### 4. Remove KV

- Delete `shared/kv.ts` (and `server/utils/kv.ts`).
- `shared/cache.ts`: in-memory `Map` only; drop `KV_NAMESPACES`, `useKv`,
  `persistAfterResponse`, `kvGet/kvPut/kvDel`, and the `event`/`waitUntil` plumbing.
- `internal.ts`: drop KV origin storage; the Worker no longer triggers cron
  (Function Triggers do), so `triggerInternal` and the origin trick are deleted.
- `refresh.ts` `backfillCompleted()`: cursor `nimeplay:v1:backfill:<source>` ->
  `app_state(key text primary key, value text, updated_at timestamptz)`.
- `wrangler.jsonc`: remove `kv_namespaces`.

### 5. R2 -> Object Storage

- `shared/media.ts`: keep the pure URL helpers (`toR2Url`, `posterSrc`,
  `absolutePosterSrc`, `toAbsoluteUrl`, `isValidMediaKey`, `keyToOrigin`,
  `fetchRemoteMedia`). Reimplement `hasCachedMedia`/`getCachedMedia`/`storeMedia`/
  `mirrorMediaItem`/`mirrorAnimeMedia` on an S3 client against `AWS_ENDPOINT_URL_S3`
  with `forcePathStyle: true`.
- Function owns mirroring (it has `AWS_*` injected): metadata sync writes posters,
  characters, voice actors to the `public_read` bucket.
- Worker `/r2/[...key]`: 302 to the bucket's public object URL; if the object is
  missing, fall back to `keyToOrigin()` (current MISS behavior) and let the Function
  backfill later. Keeps `/r2/...` URLs stable, so `toR2Url` consumers are untouched.
- Delete `r2_buckets` from `wrangler.jsonc`.

### 6. Schema: SQLite -> Postgres

Rewrite `server/database/schema.ts` with `drizzle-orm/pg-core`.

| Current (sqlite-core) | Target (pg-core) |
| --- | --- |
| `text('slug').primaryKey()` | unchanged |
| `integer('id').primaryKey({ autoIncrement: true })` | `serial('id').primaryKey()` |
| `real('rating')` | `real('rating')` |
| `integer(name, { mode: 'timestamp_ms' })` | `timestamp(name, { withTimezone: true })` |
| `jsonText<MalCharacter[]>()('characters').default(sql\`'[]'\`)` | `jsonb('characters').$type<MalCharacter[]>().notNull().default([])` |
| `.defaultNow()` (ms epoch) | `.defaultNow()` |
| `uniqueIndex` / `index` / composite `primaryKey` | unchanged |
| `alias` from `drizzle-orm/sqlite-core` | `alias` from `drizzle-orm/pg-core` |
| `anime_fts` FTS5 virtual table + 3 triggers | GIN expression index `index('anime_fts_idx').using('gin', sql\`to_tsvector('simple', ${table.title})\`)` |
| `rowid` join | removed (FTS index sits on the table) |

New tables: `app_state`. Timestamp value: `to_timestamp(<ms> / 1000.0)`.

`drizzle.config.ts`: `dialect: 'postgresql'`, `dbCredentials.url =
process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL`. Move the old
`server/database/migrations/*` to `server/database/migrations-sqlite/` for reference and
generate a fresh Postgres baseline. `package.json`: this is now the Function's migration
tooling; scripts become `drizzle-kit generate` / `drizzle-kit migrate`.

### 7. Raw SQL port

| File | Change |
| --- | --- |
| `queries.ts` | `group_concat` -> `string_agg`; `glob '[0-9]...'` -> `~ '^[0-9]{4}$'`; `substr(x, -4)` -> `right(x, 4)`; `db().all<T>(sql)` -> `(await pool.query(sql)).rows` / `db.execute`; drop `anime_fts` + `rowid`, use `to_tsvector('simple', a.title) @@ to_tsquery('simple', $1)` and `ts_rank` |
| `fts.ts` | emit a tsquery (`tok:* & tok2:*`) instead of FTS5 `"tok"*` |
| `metadata.post.ts` | same `.all` -> `execute`, same FTS rewrite |
| `refresh.ts` | `onConflictDoUpdate` + `excluded.*` already Postgres-compatible; D1 `db.batch` -> a `pool` transaction (`BEGIN`/`COMMIT`) or `db.transaction()` (interactive tx now available) |

`event?` parameters and `waitUntil` calls in `queries.ts`/`refresh.ts` are removed with KV.

### 8. Data migration

**D1 -> Postgres**

1. `npx wrangler d1 export nimeplay --remote --output /tmp/d1.sql`.
2. Load the dump into in-memory SQLite via `node:sqlite` (Node 26), stream each table to
   NDJSON (ms -> `to_timestamp`, `characters` string -> jsonb, keep NULLs).
3. Bulk load in FK order: `genres`, `anime`, `episodes`, `anime_genres` (`COPY` via
   `psql` against `DATABASE_URL_UNPOOLED`, or chunked `pg` inserts).
4. Do not copy `anime_fts`; the GIN index rebuilds from `anime.title`.

**R2 -> Object Storage**

- Preferred: no byte transfer. Keys map deterministically to MAL CDN URLs
  (`keyToOrigin`), so run a Function/script that selects `poster, characters` from
  `anime`, collects `/r2/...` paths, and calls `mirrorMediaItem` (re-fetch origin ->
  upload to the bucket).
- Fallback for dead origins: `rclone`/`aws s3 sync` between the R2 bucket and the Neon
  storage endpoint (both S3), or `wrangler r2 object get` + put.

**KV -> Postgres**

- `npx wrangler kv key list --namespace-id 6e97826a11de4cccba9c26325de2a09d`.
- Migrate durable keys only: `nimeplay:v1:backfill:*` -> `app_state`.
  `nimeplay:v1:internal_origin` is obsolete (origin trick removed). Discard the
  `list/genres/genre-page/detail/episodes/search/metadata/counts/prepare` TTL entries.

### 9. Config and secrets

- `neon.ts`:
  ```ts
  import { defineConfig } from '@neon/config/v1'
  export default defineConfig({
    functions: {
      api: {
        name: 'Nimeplay API',
        source: './functions/api/index.ts',
        customDomains: ['api.<domain>'],
        triggers: [{ type: 'schedule', name: 'catalog-sync', cron: '0 */3 * * *', functionPath: '/internal/cron/catalog-sync' }],
        env: { INTERNAL_KEY: process.env.INTERNAL_KEY ?? '' },
      },
    },
    buckets: { nimeplay: { access: 'public_read' } },
  })
  ```
  Deploy: `neon deploy` (also pulls `DATABASE_URL`/`AWS_*` into `.env`).
- Worker secrets: `NUXT_PUBLIC_API_BASE` (or `vars.API_BASE`), `INTERNAL_KEY` if the
  Worker calls `/internal/*`.
- `README.md`: replace the D1/KV/R2 local-emulation section with `neon link` /
  `neon dev` / `neon deploy` and `drizzle-kit migrate`.

## Rollout phases

| Phase | Work | Exit criteria |
| --- | --- | --- |
| 0 | `neon link`, `neon deploy` for the `api` function + bucket + trigger; region Singapore | Function URL + bucket respond |
| 1 | Postgres schema + migrations + `shared/` extraction | `drizzle-kit generate/migrate` clean; typecheck green |
| 2 | Port queries/refresh/FTS to the Function; cron via Trigger | Function serves data routes; cron writes rows |
| 3 | D1 data load + KV cursor | Row counts match; backfill resumes |
| 4 | Media to Object Storage; Worker `/r2` redirect | Sample posters resolve from the bucket |
| 5 | Frontend `apiBase` + Worker stream-only; deploy to preview | Full smoke test |
| 6 | Cutover, observe, decommission D1/R2/KV | 48h stable, then delete bindings |

Keep D1/R2/KV intact until Phase 6. Rollback: revert `wrangler.jsonc` + `apiBase` and
redeploy the previous Worker.

## Verification

- Table counts and `anime.status` distribution match D1.
- Search returns equivalent results for a fixed query set; `ts_rank` ordering sane.
- Function data routes: `/api/v1/anime`, `/api/v1/anime/:malId`, `/api/v1/genre/:slug`,
  `/api/home`, `/api/search`, `/api/anime/:malId`, `/api/anime/:malId/:episode/meta`.
- `/openapi.json` + `/docs` render on the Function.
- `/r2/posters/...` redirects and returns bytes with immutable cache headers.
- Episode page: Worker `/api/anime/:malId/:episode` resolves meta via the Function, then
  `/api/mirror/prepare` + `/api/stream` playback works end to end.
- Trigger fires `catalog-sync`/`metadata-sync` every 3h; `catalog-health` counts move;
  `app_state` cursor advances instead of restarting.
- Browser CORS: hydrated client fetches to `api.<domain>` succeed.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Neon account-wide 100 concurrent invocations | Keep the Function handler fast; cache hot reads; watch 429 `Retry-After` |
| Function cold start / idle eviction | Long-running runtime, `pg` Pool warm at module scope; acceptable TTFB |
| Public Function URL (custom domain does not authenticate) | Keep `x-nimeplay-key` on `/internal/*`; data routes stay public as today |
| npm dependency duplication across two runtimes | Single `shared/` dir, no `h3`/Nuxt imports inside it |
| FTS semantics change | `simple` config for prefix match; `pg_trgm` as a follow-up |
| Two origins (API split) | `apiBase` helper; Function docs link the watch endpoint |
| Object Storage region + 5 GB free | Project must be in a supported region; monitor bucket size |
| Long `catalog-sync` scraping inside the Function | 15-min TTFB budget is ample; `waitUntil` not needed, return after the run or 202 + process |

## Effort

| Workstream | Estimate |
| --- | --- |
| `shared/` extraction + schema + db layer | L |
| Function API (Hono routes, docs, cron) | L |
| Worker strip-down + frontend `apiBase` | M |
| KV removal + `app_state` | S |
| Media to Object Storage | M |
| D1 data migration script | M |
| Config (`neon.ts`, secrets) + verification | S |

Roughly 3-5 focused days.
