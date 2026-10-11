#!/bin/sh
set -eu
cd /app
pnpm --filter @solar/api exec prisma migrate deploy
exec pnpm --filter @solar/api start
