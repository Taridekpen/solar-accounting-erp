# Architecture

The repository is one company system, not a multi-tenant platform. Section 1 establishes the runtime only.

## Authority

The API owns configuration validation, database access, and future posting decisions. `packages/shared` exposes types and display formatting. It does not import Prisma. `packages/accounting-rules` is reserved for posting mappings and currently records that the API is the financial authority.

## Runtime

- PostgreSQL is the system of record. The first migration stores non-financial `system_metadata` so Prisma has a real, repeatable migration. Company and ledger tables arrive in later sections.
- Redis and BullMQ are connected and included in the health check. There are no business jobs yet.
- Sessions, permissions, and the posting engine are not implemented in this section.

## Money

Amounts that cross the API boundary are decimal strings. Display formatting uses `decimal.js` and Nigerian Naira. JavaScript floating-point values are not used to calculate totals.

## Dates

Dashboard month and year presets use the company timezone. The seeded timezone is `Africa/Lagos`.

PostgreSQL is published on host port 5433 so it can run beside another local Postgres already bound to 5432. Containers reach the database through the Compose service name on port 5432.
