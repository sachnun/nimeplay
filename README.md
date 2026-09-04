# Nimeplay

Minimal anime streaming app built with Nuxt 4, Vue 3, Tailwind CSS, and Nitro server APIs. It includes search, genre browsing, anime detail pages, episode navigation, and a custom player.

<p align="center"><img src="docs/screenshots/nest-hub-max.webp" alt="Nimeplay on Nest Hub Max" height="220">&nbsp;&nbsp;&nbsp;<img src="docs/screenshots/ipad-mini.webp" alt="Nimeplay on iPad Mini" height="220">&nbsp;&nbsp;&nbsp;<img src="docs/screenshots/iphone-14-pro-max.webp" alt="Nimeplay on iPhone 14 Pro Max" height="220"></p>

## Setup

Requires Node.js 20+.

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

Production build and preview:

```bash
npm run build
npm run preview
```

Static build:

```bash
npm run generate
```

## Database (Cloudflare D1)

All data lives in a Cloudflare D1 database bound as `DB`. The schema is defined in `server/database/schema.ts` (Drizzle, SQLite dialect); the D1 binding is declared in `nuxt.config.ts` and mirrored in `wrangler.jsonc` for local tooling.

- Apply schema migrations to the local emulated database: `npm run db:migrate:local`
- Apply schema migrations to the remote database: `npm run db:migrate`
- Regenerate a migration from the schema: `npm run db:generate`

Local development (`npm run dev`) emulates D1 through `wrangler` (see the nitro Cloudflare dev plugin), reusing the same persisted state as `db:migrate:local`. Remote queries against the API hit the production D1 database.

Scraping runs against the same D1 database and therefore cannot execute in plain Node. Run a local dev server, then trigger a scrape through the HTTP endpoint (both processes need the same `CRON_SECRET`):

```bash
CRON_SECRET=change-me npm run dev
CRON_SECRET=change-me npm run scrape
```

## Development

The main app lives in `app/`, server APIs live in `server/`, and static files live in `public/`.

```bash
npm run typecheck
```
