# Nimeplay

<p align="center">
  <img src="https://github.com/user-attachments/assets/1b96e046-6f46-44b4-8ee1-5c1f12787744" alt="Nimeplay" width="880">
</p>

Watch anime with no ads, no comments, no popups, and no distractions.

Needs Node >=26, pnpm, a Neon project with Postgres + Object Storage, and Wrangler login.
Credentials load from `.env.local` (`neon link` / `neon env pull`); see `.env.example`.

```bash
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`.

| Data | Store | Served by |
| --- | --- | --- |
| Anime, episodes, genres, characters | Neon Postgres | `/api/*` |
| Images | Neon Object Storage | `/media/*` |

Metadata writes queue images in the `media` table; `media-sync` mirrors them to Object
Storage before `/media/<key>` serves them.

| Task | Schedule | Does |
| --- | --- | --- |
| `catalog-sync` | `0 */3 * * *` | Scrape sources, register anime and episodes |
| `metadata-sync` | `0 */3 * * *` | Resolve MAL metadata, write characters, queue images |
| `media-sync` | `0 */3 * * *` | Mirror queued images into Object Storage |

Workers Free caps an invocation at 50 subrequests, so jobs run Neon queries through a
WebSocket pool (`withPool` in `server/utils/db.ts`) and `media-sync` mirrors a bounded
batch per run. Schema changes: `pnpm db:generate && pnpm db:migrate`.

Public API under `/api/v1/*`, reference at `/docs`.

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
the deployed Worker URL. Preview locally with `npx wrangler --cwd .output dev`.
