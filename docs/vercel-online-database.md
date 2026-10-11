# Deploy the web app to Vercel and run the database online

This project is a **Vite React frontend** plus a **NestJS API** that needs **PostgreSQL** and **Redis** (BullMQ). Vercel is a good home for the **web** app. The API should run on a always-on Node host (Railway, Render, Fly.io, or similar)—not as a Vercel serverless function—because of sessions, Prisma migrations, and Redis/BullMQ.

```text
Browser  →  Vercel (apps/web static build)
              │
              │  VITE_API_URL=https://api.your-domain.com
              ▼
         Railway / Render / Fly  (apps/api Nest process)
              │
              ├── Neon / Supabase / Railway Postgres  (DATABASE_URL)
              └── Upstash Redis or host Redis         (REDIS_URL)
```

## Prerequisites

- GitHub (or GitLab/Bitbucket) repo with this project
- Accounts: [Vercel](https://vercel.com), a Postgres host ([Neon](https://neon.tech) recommended), an API host ([Railway](https://railway.app) recommended), Redis ([Upstash](https://upstash.com) or Railway Redis)
- Local Node 22 + pnpm for one-time migrate/seed if you prefer CLI over the API entrypoint

---

## Step 1 — Create the online PostgreSQL database

1. Open [Neon](https://neon.tech) (or Supabase / Railway Postgres) and create a project in a region near your users.
2. Create a database (for example `solar_accounting`).
3. Copy the connection string. Prefer the **pooled** URL for the running API if the host provides one, and keep a **direct** URL for migrations if Neon requires it.
4. Shape the URL like:

   ```text
   postgresql://USER:PASSWORD@HOST/solar_accounting?schema=public&sslmode=require
   ```

5. Save it as `DATABASE_URL` for the API environment (next steps). Do not commit it.

---

## Step 2 — Create Redis

1. Create a Redis instance (Upstash Redis or Redis on Railway).
2. Copy the Redis URL, for example:

   ```text
   rediss://default:PASSWORD@HOST:PORT
   ```

3. Save it as `REDIS_URL` for the API.

The API health check and BullMQ jobs need Redis. Without it, `/health` fails and background authorization jobs will not run.

---

## Step 3 — Deploy the Nest API (not on Vercel)

Use Railway, Render, or Fly. Example with **Render** or **Railway**:

1. New project → **Deploy from GitHub** → select this repository.
2. Add a **Web Service** for the API. Keep **Root Directory** empty (monorepo root). Do not set it to `apps/api` when using the commands below.
3. Build and start (seed is **not** part of start — run seed once manually if the DB is empty; skip if already seeded):
   - **Build command:**  
     `pnpm install --frozen-lockfile --prod=false && pnpm --filter @solar/shared build && pnpm --filter @solar/accounting-rules build && pnpm --filter @solar/api exec prisma generate && pnpm --filter @solar/api build && test -f apps/api/dist/main.js`  
     `--prod=false` keeps `@nestjs/cli` available so `nest build` writes `apps/api/dist/main.js`. The final `test -f` fails the build early if that file is missing.
   - **Start command:**  
     `pnpm --filter @solar/api start:prod`  
     (runs `prisma migrate deploy`, then `node dist/main.js` — no seed)
   - **Nest emit path:** [`apps/api/tsconfig.build.json`](../apps/api/tsconfig.build.json) sets `"rootDir": "src"` so `nest build` writes `apps/api/dist/main.js` (not `dist/src/main.js`). Start scripts use `node dist/main.js`.
   - After changing build settings, use **Manual Deploy → Clear build cache & deploy** on Render.
4. Set environment variables on the API service:

   | Variable | Example / notes |
   | --- | --- |
   | `NODE_ENV` | `production` (runtime; install still uses `--prod=false` in the build command) |
   | `PORT` | Leave unset on Render so it uses the injected port, or set `3000` if the host expects it |
   | `DATABASE_URL` | Neon/Supabase direct or pooled URL with `sslmode=require` |
   | `REDIS_URL` | Upstash `rediss://…` or host Redis URL |
   | `WEB_ORIGIN` | Your Vercel URL, e.g. `https://your-app.vercel.app` (update after Step 4) |
   | `SESSION_SECRET` | Random string, at least 32 characters |
   | `LOG_LEVEL` | `info` |

5. Deploy and open the public API URL, for example `https://your-api.onrender.com`.
6. Confirm health:

   ```bash
   curl https://YOUR-API-HOST/health
   ```

   You should see `"status":"ok"` with database, redis, and queue checks.

7. Note the API origin for the web env (`VITE_API_URL`).

**CORS / cookies:** The API allows only `WEB_ORIGIN` with credentials. After the Vercel URL exists, set `WEB_ORIGIN` to that exact HTTPS origin (no trailing slash) and redeploy the API.

---

## Step 4 — Deploy the web app to Vercel

1. Go to [vercel.com/new](https://vercel.com/new) → Import the Git repository.
2. Configure the project:
   - **Framework Preset:** Vite
   - **Root Directory:** `apps/web`  
     *(If the monorepo install fails, leave root at repository root and use the override commands below.)*
   - **Install Command:**  
     `cd ../.. && pnpm install --frozen-lockfile`  
     (when Root Directory is `apps/web`)  
     or from repo root: `pnpm install --frozen-lockfile`
   - **Build Command:**  
     `pnpm --filter @solar/shared build && pnpm --filter @solar/web build`  
     (from repo root)  
     or if Root is `apps/web`:  
     `cd ../.. && pnpm --filter @solar/shared build && pnpm --filter @solar/web build`
   - **Output Directory:** `dist` (relative to `apps/web`)
3. Environment variables for the **web** project (Production):

   | Variable | Value |
   | --- | --- |
   | `VITE_API_URL` | `https://YOUR-API-HOST` (no trailing slash) |

   Vite bakes `VITE_*` at **build** time. Change it → redeploy the web app.
4. Deploy. Open `https://your-app.vercel.app`.
5. Update the API `WEB_ORIGIN` to that Vercel URL and redeploy the API.
6. Sign in with the seeded admin (or an invited user). If login fails with a network/CORS error, `WEB_ORIGIN` and `VITE_API_URL` do not match the live hosts.

### Optional `vercel.json` (repo root or `apps/web`)

SPA fallback so deep links like `/imports` work:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Place this in `apps/web` if that is the Vercel root directory.

---

## Step 5 — Migrations (and optional one-time seed)

The API **start** command already runs `prisma migrate deploy`. Do **not** put `prisma db seed` in the host start command after the database has been seeded once.

If Neon is empty and you need the first admin/roles/COA, run seed **once** from your machine (with production `DATABASE_URL`):

```bash
cd apps/api
set DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
```

On PowerShell:

```powershell
$env:DATABASE_URL = "postgresql://USER:PASSWORD@HOST/neondb?sslmode=require"
pnpm --filter @solar/api exec prisma migrate deploy
pnpm --filter @solar/api exec prisma db seed
```

If the database is already seeded, skip this step. Confirm `system_metadata.schema_version` is `16` (or current) when you do seed.

---

## Step 6 — Cookie and HTTPS checklist

- API `NODE_ENV=production` so session cookies are `Secure`.
- Web and API both use **HTTPS**.
- `WEB_ORIGIN` exactly equals the browser origin (scheme + host + port if any).
- Browser calls use `credentials: "include"` (already in the web client).
- If the API and web are on different sites, third-party cookie rules can block sessions. Prefer putting the API on a subdomain of the same site later (`api.yourdomain.com` + `app.yourdomain.com`) with cookies scoped carefully, or keep testing on Vercel preview + API host and verify login in the browser DevTools → Application → Cookies.

---

## Step 7 — Custom domain (optional)

1. In Vercel: Project → Settings → Domains → add `app.yourdomain.com`.
2. In the API host: add `api.yourdomain.com`.
3. Set `VITE_API_URL=https://api.yourdomain.com`, rebuild web.
4. Set `WEB_ORIGIN=https://app.yourdomain.com`, restart API.

---

## What not to do on Vercel alone

| Piece | On Vercel? | Why |
| --- | --- | --- |
| `apps/web` | Yes | Static Vite build |
| `apps/api` Nest + Prisma + BullMQ | No (for this app) | Needs a long-lived process and Redis |
| PostgreSQL | No | Use Neon/Supabase/Railway |
| Redis | No | Use Upstash/Railway |

Trying to squeeze the whole Nest API into Vercel Serverless would break health checks, queues, and reliable migrate-on-boot unless you redesign the API.

---

## Quick verification

1. `GET https://API/health` → ok, database/redis/queue up  
2. Open `https://WEB/login` → sign in  
3. Open Dashboard → totals are decimal strings from the API  
4. Scroll a long page (Settings / Imports): **main content scrolls**; **sidebar nav scrolls separately** and stays in the viewport  

---

## Related docs

- [deployment.md](./deployment.md) — Docker Compose production path  
- [production-readiness.md](./production-readiness.md) — go-live checklist  
- [.env.production.example](../.env.production.example) — production secret names  
