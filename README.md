# Nimeplay

Nuxt 4 anime streaming app migrated from the original Next.js implementation.

## Setup

Install dependencies with pnpm:

```bash
pnpm install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

## Production

Build the application for production:

```bash
pnpm build
```

Locally preview production build:

```bash
pnpm preview
```

## Android TV APK

Build APK debug untuk sideload pribadi dari GitHub Actions:

1. Buka tab `Actions` di GitHub.
2. Pilih workflow `Android TV APK`.
3. Klik `Run workflow`.
4. Unduh artifact `nimeplay-android-tv-debug-apk` setelah job selesai.

APK Android TV ini membuka `https://nimeplay-nuxt.sachnun.workers.dev/` melalui Capacitor WebView, jadi backend tersebut harus aktif saat aplikasi digunakan.
