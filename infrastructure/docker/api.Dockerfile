FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app

FROM base AS development
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/shared packages/shared
COPY packages/accounting-rules packages/accounting-rules
COPY infrastructure/docker/api-entrypoint.sh /entrypoint.sh
RUN pnpm install --frozen-lockfile \
  && chmod +x /entrypoint.sh \
  && pnpm --filter @solar/shared build \
  && pnpm --filter @solar/api exec prisma generate
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY apps/api apps/api
COPY packages/shared packages/shared
COPY packages/accounting-rules packages/accounting-rules
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @solar/shared build \
  && pnpm --filter @solar/accounting-rules build \
  && pnpm --filter @solar/api build

FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
COPY infrastructure/docker/api-entrypoint.prod.sh /entrypoint.prod.sh
RUN chmod +x /entrypoint.prod.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.prod.sh"]
