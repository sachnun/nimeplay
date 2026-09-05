# Nimeplay

<p align="center">
  <img src="https://github.com/sachnun/nimeplay/releases/download/assets/device-shot.webp" alt="Nimeplay" width="880">
</p>

Minimal anime streaming: browse genres, search titles, and watch episodes.

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Syncing data

The catalog is synced by a scraper. Start the dev server first, then:

```bash
npm run scrape          # incremental sync
npm run scrape -- --full
```

Schema migrations:

```bash
npm run db:generate
npm run db:migrate:local
npm run db:migrate      # production database
```

## Production build

```bash
npm run build
npm run preview
```
