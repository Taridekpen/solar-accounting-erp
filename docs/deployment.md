# Deployment

For hosting the **Vite web app on Vercel** with an online Postgres (and the Nest API on Railway/Render/Fly), see [vercel-online-database.md](./vercel-online-database.md).

## Production compose

Use [`docker-compose.prod.yml`](../docker-compose.prod.yml) with [`.env.production.example`](../.env.production.example) copied to `.env.production`.

- PostgreSQL is not published on the host by default.
- The API image target is `production`. On start it runs `prisma migrate deploy`, then `node` via `pnpm --filter @solar/api start` (no seed on boot; seed once manually if the DB is empty).
- On Render/Railway, use build with `pnpm install --frozen-lockfile --prod=false` (and `test -f apps/api/dist/main.js`) and start `pnpm --filter @solar/api start:prod`.
- Nest production emit: `apps/api/tsconfig.build.json` uses `"rootDir": "src"` so output is `dist/main.js` (matching `start` / `start:prod`). On Render, clear the build cache after changing this.
- The web image serves the Vite build through nginx. TLS terminates at nginx using certificates mounted from `TLS_CERT_DIR` (default `./infrastructure/certs`).
- Set `WEB_ORIGIN` to the public HTTPS origin and keep `COOKIE_SECURE=true` with `NODE_ENV=production` so session cookies are marked Secure.

### Lab TLS

Generate a self-signed certificate for local or lab use:

```bash
mkdir -p infrastructure/certs
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout infrastructure/certs/tls.key \
  -out infrastructure/certs/tls.crt \
  -subj "/CN=localhost"
```

### Managed Postgres

Point `DATABASE_URL` at a managed PostgreSQL instance and omit the compose `postgres` service when the provider hosts the database. Migrations still run from the API entrypoint.

## Backups

- Linux/macOS: [`infrastructure/scripts/backup-postgres.sh`](../infrastructure/scripts/backup-postgres.sh) and [`restore-postgres.sh`](../infrastructure/scripts/restore-postgres.sh)
- Windows: [`backup-postgres.ps1`](../infrastructure/scripts/backup-postgres.ps1) and [`restore-postgres.ps1`](../infrastructure/scripts/restore-postgres.ps1)
- Automated check: `node infrastructure/scripts/backup-restore.test.mjs` dumps the current database, restores into `solar_backup_restore_test`, and confirms `SELECT 1` plus `system_metadata.schema_version`.

## Health and logs

- `GET /health` reports database, Redis, queue connectivity, and BullMQ waiting/active/delayed/failed counts.
- Application logs are structured Pino JSON on stdout. Ship those logs with your platform collector.
- Optional `SENTRY_DSN` may be set for operators who forward to an error service; the application does not require a SaaS SDK.

## CI

[`.github/workflows/ci.yml`](../.github/workflows/ci.yml) installs dependencies, migrates and seeds Postgres (including `solar_accounting_test`), runs typecheck and the test suite, then runs the backup-restore script.
