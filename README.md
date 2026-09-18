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

## Data

| Data | Store | Served by |
| --- | --- | --- |
| Anime, episodes, genres | Neon Postgres | `/api/*` |
| Characters | Neon Postgres (`characters`) | `/api/*` |
| Images (posters, characters, voice actors) | Neon Object Storage | `/media/*` |

Nothing is fetched from the origin on the read path. Every image is queued in the
`media` table when metadata is written and mirrored to Object Storage by the
`media-sync` job before `/media/<key>` serves it. Cloudflare KV is no longer used;
hot reads are cached in memory per isolate.

Local credentials come from `.env.local`, written by `neon link` / `neon env pull`
(`DATABASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL_S3`,
`AWS_REGION`). See `.env.example`.

## Jobs

| Task | Schedule | Does |
| --- | --- | --- |
| `catalog-sync` | `0 */3 * * *` | Scrape sources, register anime and episodes |
| `metadata-sync` | `0 */3 * * *` | Resolve MAL metadata, write characters, queue images |
| `media-sync` | `0 */3 * * *` | Mirror queued images into Object Storage |

Workers Free caps a single invocation at 50 subrequests. The write-heavy jobs run all
their Neon queries through a WebSocket pool (`withPool` in `server/utils/db.ts`), and
`media-sync` mirrors a bounded batch per run.

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
