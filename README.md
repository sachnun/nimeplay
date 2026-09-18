# Nimeplay

<p align="center">
  <img src="https://github.com/user-attachments/assets/1b96e046-6f46-44b4-8ee1-5c1f12787744" alt="Nimeplay" width="600">
</p>

Watch anime without ads, comments, or popups. Just watch.

## Get running

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. Credentials come from `.env.local` (see `.env.example`),
written by `neon link` / `neon env pull`.

## How it works

| Data | Lives in | Served from |
| --- | --- | --- |
| Anime, episodes, genres, characters | Neon Postgres | `/api/*` |
| Images (posters, characters, voice actors) | Neon Object Storage | `/media/*` |

Three jobs run every 3 hours: `catalog-sync` (scrape sources), `metadata-sync` (resolve
MAL metadata, queue images), and `media-sync` (mirror images to Object Storage).
Everything is cached, so reads never hit the origin.

Changed the schema? `pnpm db:generate && pnpm db:migrate`.

## API

Public endpoints live under `/api/v1/*`, with a browsable reference at `/docs`.

## Deploy

```bash
pnpm build
npx wrangler --cwd .output deploy
```

Set the Worker secrets once (same names as `.env.local`):

```bash
for s in DATABASE_URL AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_ENDPOINT_URL_S3 AWS_REGION; do
  npx wrangler secret put "$s" --cwd .output
done
```

`MEDIA_BUCKET` and `APP_ORIGIN` are plain vars in `wrangler.jsonc`; point `APP_ORIGIN`
at the deployed Worker URL.
