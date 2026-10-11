FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.5.2 --activate
WORKDIR /app

FROM base AS development
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/shared packages/shared
COPY packages/accounting-rules packages/accounting-rules
RUN pnpm install --frozen-lockfile
EXPOSE 5173
CMD ["pnpm", "--filter", "@solar/web", "dev", "--host", "0.0.0.0", "--port", "5173"]

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages/shared packages/shared
COPY packages/accounting-rules packages/accounting-rules
RUN pnpm install --frozen-lockfile \
  && pnpm --filter @solar/shared build \
  && pnpm --filter @solar/web build

FROM nginx:1.27-alpine AS production
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
