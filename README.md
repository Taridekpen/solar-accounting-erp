# Solar & Inverter Accounting

Monorepo for a multi-branch solar and inverter accounting system. Section 1 provides the application shell, API foundation, and development environment. Business ledgers start in later sections.

## Requirements

- Node.js 22
- pnpm 11
- Docker, for PostgreSQL and Redis

## Local development

```powershell
Copy-Item .env.example .env
docker compose up -d postgres redis
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

PostgreSQL is published on host port **5433** so it does not collide with another local Postgres on 5432. Redis is published on port 6379.

- Web: http://localhost:5173
- API: http://localhost:3000
- Health: http://localhost:3000/health
- API docs (development only): http://localhost:3000/api/docs

## Full Docker environment

```powershell
docker compose up --build
```

The API container applies migrations and the repeatable seed before it starts.

## Checks

```powershell
pnpm test
pnpm typecheck
```

## Layout

- `apps/web` — React application
- `apps/api` — NestJS API and Prisma schema
- `packages/shared` — types and money formatting
- `packages/accounting-rules` — posting rules, added in Section 4

Financial calculations belong on the API. The web app formats decimal strings returned by the server.
