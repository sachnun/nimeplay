# Nimeplay

<p align="center">
  <img src="https://github.com/user-attachments/assets/1b96e046-6f46-44b4-8ee1-5c1f12787744" alt="Nimeplay" width="880">
</p>

Watch anime with no ads, no comments, no popups, no distractions.

## Run locally

```bash
cp .env.example .env.local
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

## Tasks

```bash
npx nitro task run tick
npx nitro task run catalog
```

## API

`/api/v1/*`
Docs: `/docs`

## Deploy

```bash
pnpm build
npx wrangler --cwd .output deploy
```
