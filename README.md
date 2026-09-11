# Nimeplay

<p align="center">
  <img src="https://github.com/sachnun/nimeplay/releases/download/assets/device-shot.webp" alt="Nimeplay" width="880">
</p>

Watch anime with no ads, no comments, no popups, and no distractions. Just watch and enjoy.

## Requirements

Node >=22 and a configured Wrangler login.

## Quick start

```bash
npm install
npm run db:migrate:local
npm run dev
```

Open `http://localhost:3000`.

Local bindings emulate D1 (`DB`), KV (`CACHE`), and R2 (`R2`) via `wrangler.jsonc`.

## Catalog sync

`catalog-sync` runs every 10 minutes via Nitro `scheduledTasks` and the Workers cron trigger.

Schema changes:

```bash
npm run db:generate
npm run db:migrate:local
npm run db:migrate      # production database
```

## API

Public endpoints live under `/api/v1/*`.

Interactive reference: `/docs` (source: `/openapi.json`).

## Production

```bash
npm run build
npx wrangler deploy
```

Preview a production build locally:

```bash
npx wrangler dev
```
