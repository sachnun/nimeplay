# Nimeplay

Minimal anime streaming app built with Nuxt 4, Vue 3, Tailwind CSS, tRPC, and Capacitor Android. It includes search, genre browsing, anime detail pages, episode navigation, and a custom player.

<p align="center"><img src="docs/screenshots/nest-hub-max.webp" alt="Nimeplay on Nest Hub Max" height="220">&nbsp;&nbsp;&nbsp;<img src="docs/screenshots/ipad-mini.webp" alt="Nimeplay on iPad Mini" height="220">&nbsp;&nbsp;&nbsp;<img src="docs/screenshots/iphone-14-pro-max.webp" alt="Nimeplay on iPhone 14 Pro Max" height="220"></p>

## Setup

Requires Node.js 20+ and pnpm 10+.

```bash
pnpm install
```

Run locally:

```bash
pnpm dev
```

Open `http://localhost:3000` in your browser.

Database setup:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/nimeplay pnpm db:migrate
```

Initial Otakudesu catalog sync stores anime route/episode data from Otakudesu and anime metadata/posters from MyAnimeList via Jikan:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/nimeplay pnpm sync:catalog
```

Catalog sync processes anime concurrently while Jikan requests are globally paced. Tune workers with `--concurrency` or `SYNC_CATALOG_CONCURRENCY`:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/nimeplay pnpm sync:catalog -- --concurrency=3
```

For a small smoke test:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/nimeplay pnpm sync:catalog -- --limit=20
```

Latest ongoing anime refresh is designed for hourly cron:

```bash
DATABASE_URL=postgres://user:password@localhost:5432/nimeplay pnpm sync:latest
```

Production cron can also call `POST /api/cron/otakudesu/latest` with `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set.

Production build and preview:

```bash
pnpm build
pnpm preview
```

Static build:

```bash
pnpm generate
```

## Development

The main app lives in `app/`, server APIs and tRPC live in `server/`, static files live in `public/`, and the Capacitor project lives in `android/`.

```bash
pnpm typecheck
```

## Android

Requires Android Studio and JDK.

```bash
pnpm android:sync
pnpm android:debug
pnpm android:open
```
