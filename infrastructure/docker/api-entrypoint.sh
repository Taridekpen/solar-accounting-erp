#!/bin/sh
set -eu
cd /app
pnpm --filter @solar/api exec prisma migrate deploy
pnpm --filter @solar/api exec prisma db seed
exec pnpm --filter @solar/api dev
