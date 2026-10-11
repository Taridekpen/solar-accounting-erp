# Database migrations

Production and the development database apply migrations with Prisma:

```bash
pnpm --filter @solar/api db:migrate
pnpm --filter @solar/api db:seed
```

`migrate deploy` applies the files in `apps/api/prisma/migrations`. It does not drop data. The seed is idempotent: running it again updates the schema version and inserts missing reference rows, and it does not overwrite an edited company profile.

## Disposable test database

`solar_accounting_test` is the only database the reset script will recreate. It refuses to run when the target name is the development database `solar_accounting`.

```bash
node infrastructure/scripts/reset-test-db.mjs
```

The script drops and creates `solar_accounting_test` on the same PostgreSQL server as `DATABASE_URL`, then runs `prisma migrate deploy` and the seed against that database only.

## Rollback

Prisma does not run rollback files automatically. Each migration folder that changes organization data includes `rollback.sql` for a manual, reviewed rollback of that migration. Apply it only to a database you intend to return to the previous schema.
