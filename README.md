# Nimeplay

Minimal anime streaming app built with Nuxt 4, Vue 3, Tailwind CSS, tRPC, and Capacitor Android. It includes search, genre browsing, anime detail pages, episode navigation, and a custom player.

<p align="center"><img src="docs/screenshots/ipad-mini.webp" alt="Nimeplay on iPad Mini" width="31%"><img src="docs/screenshots/iphone-14-pro-max.webp" alt="Nimeplay on iPhone 14 Pro Max" width="31%"><img src="docs/screenshots/nest-hub-max.webp" alt="Nimeplay on Nest Hub Max" width="31%"></p>

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
