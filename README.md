# Nimeplay

<p align="center">
  <img src="https://github.com/user-attachments/assets/1b96e046-6f46-44b4-8ee1-5c1f12787744" alt="Nimeplay" width="880">
</p>

Watch anime with no ads, no comments, no popups, and no distractions.

Needs Node >=26, pnpm, a Neon project with Postgres + Object Storage, and Wrangler login.
Credentials load from `.env.local` (`neon link` / `neon env pull`); see `.env.example`.

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`.

| Data | Store | Served by |
| --- | --- | --- |
| Anime, episodes, genres, characters | Neon Postgres | `/api/*` |
| Images | Neon Object Storage | `/media/*` |

Metadata writes queue images in the `media` table; queue jobs mirror them to Object
Storage before `/media/<key>` serves them.

Two cron triggers only enqueue jobs; all work runs in the `nimeplay-jobs` Cloudflare
Queue (binding `JOBS`), each job wrapped in a Neon WebSocket pool.

| Trigger | Job | Does |
| --- | --- | --- |
| `*/30 * * * *` | `ongoing` | Scrape ongoing catalog, fill episodes, resolve metadata, mirror images |
| `0 3 * * *` | `completed` | Backfill completed lists, resolve metadata, mirror images |
| chained | `media` | Mirror queued images; re-enqueues itself until none are pending |

Schema changes: `pnpm db:generate && pnpm db:migrate`.

Public API under `/api/v1/*`, reference at `/docs`.

```bash
pnpm build
npx wrangler --cwd .output deploy
```

Create the queue once before the first deploy:

```bash
npx wrangler queues create nimeplay-jobs
```

Set Worker secrets once:

```bash
npx wrangler secret put DATABASE_URL --cwd .output
npx wrangler secret put AWS_ACCESS_KEY_ID --cwd .output
npx wrangler secret put AWS_SECRET_ACCESS_KEY --cwd .output
npx wrangler secret put AWS_ENDPOINT_URL_S3 --cwd .output
npx wrangler secret put AWS_REGION --cwd .output
```

`MEDIA_BUCKET` and `APP_ORIGIN` are plain vars in `wrangler.jsonc`; set `APP_ORIGIN` to
the deployed Worker URL. Preview locally with `npx wrangler --cwd .output dev`.
