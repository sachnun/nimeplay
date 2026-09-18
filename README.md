# Nimeplay

<p align="center">
  <img src="https://github.com/user-attachments/assets/1b96e046-6f46-44b4-8ee1-5c1f12787744" alt="Nimeplay" width="880">
</p>

Watch anime with no ads, no comments, no popups, and no distractions.

## Get running

Needs Node >=26, pnpm, a Neon project with Postgres + Object Storage, and Wrangler login.
Credentials load from `.env.local` (`neon link` / `neon env pull`); see `.env.example`.

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`.

## How it works

| Data | Lives in | Served from |
| --- | --- | --- |
| Anime, episodes, genres, characters | Neon Postgres | `/api/*` |
| Images (posters, characters, voice actors) | Neon Object Storage | `/media/*` |

Metadata writes queue images in the `media` table; queue jobs mirror them to Object
Storage before `/media/<key>` serves them.

Two cron triggers only enqueue jobs; all work runs in the `nimeplay-jobs` Cloudflare
Queue (binding `JOBS`), each job wrapped in a Neon WebSocket pool.

| Trigger | Job | Does |
| --- | --- | --- |
| `*/30 * * * *` | `ongoing` | Scrape ongoing catalog, fill episodes, resolve metadata, mirror images |
| `0 3 * * *` | `completed` | Backfill completed lists, resolve metadata, mirror images |
| chained | `media` | Mirror queued images; re-enqueues itself until none are pending |

Changed the schema? `pnpm db:generate && pnpm db:migrate`.

## API

Public endpoints live under `/api/v1/*`, with a browsable reference at `/docs`.

## Deploy

```bash
pnpm build
npx wrangler --cwd .output deploy
```

Create the queue once before the first deploy:

```bash
npx wrangler queues create nimeplay-jobs
```

Set the Worker secrets once (same names as `.env.local`):

```bash
for s in DATABASE_URL AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_ENDPOINT_URL_S3 AWS_REGION; do
  npx wrangler secret put "$s" --cwd .output
done
```

`MEDIA_BUCKET` and `APP_ORIGIN` are plain vars in `wrangler.jsonc`; point `APP_ORIGIN`
at the deployed Worker URL. Preview a production build locally with
`npx wrangler --cwd .output dev`.
