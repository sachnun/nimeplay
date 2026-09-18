# Nimeplay

<p align="center">
  <img src="https://github.com/user-attachments/assets/1b96e046-6f46-44b4-8ee1-5c1f12787744" alt="Nimeplay" width="880">
</p>

Watch anime with no ads, no comments, no popups, and no distractions. Just watch and enjoy.

## Requirements

Node >=26, pnpm, a Neon project with Postgres + Object Storage, and a configured Wrangler login.

## Quick start

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`.

Data lives on Neon:

| Data | Store |
| --- | --- |
| Catalog (anime, episodes, genres) | Neon Postgres |
| Posters, characters, voice actors | Neon Object Storage (S3) |
| Hot cache | in-memory per isolate (KV is gone) |

Local credentials come from `.env.local`, written by `neon link` / `neon env pull`
(`DATABASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`,
`AWS_REGION`). See `.env.example`.

## Catalog sync

`catalog-sync` and `metadata-sync` run every 3 hours via Nitro `scheduledTasks` and the
Workers cron trigger. The write-heavy sync runs its Neon queries through a WebSocket
pool (`withPool` in `server/utils/db.ts`) so it stays within the Workers Free
50-subrequest limit; ordinary requests use the HTTP driver.

Schema changes:

```bash
pnpm db:generate
pnpm db:migrate
```

## API

Public endpoints live under `/api/v1/*`.

Interactive reference: `/docs` (source: `/openapi.json`).

## Production

```bash
pnpm build
npx wrangler --cwd .output deploy
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
the deployed Worker URL so scheduled tasks can route through the placed API.

Preview a production build locally:

```bash
npx wrangler --cwd .output dev
```
