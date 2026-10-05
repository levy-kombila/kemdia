# syntax=docker/dockerfile:1.7
# Image de production multi-étapes : seul le résultat « standalone » de Next.js est conservé.
# Principe DevOps « build once, deploy many » : la MÊME image est promue de staging vers production.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

FROM base AS deps
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
WORKDIR /repo
# URL canonique du site (SEO). Identique pour staging et production : staging est protégé et non indexé.
ARG NEXT_PUBLIC_SITE_URL=https://kemdia.ga
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/apps/web/node_modules ./apps/web/node_modules
COPY . .
RUN pnpm --filter @kemdia/web build

FROM node:22-alpine AS runner
WORKDIR /app
# Version inscrite dans l'image (sha-<commit>) : exposée par /api/health, surchargée par deploy.sh si besoin
ARG APP_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    APP_VERSION=$APP_VERSION APP_ENV=production
# Correctifs de sécurité de l'OS + suppression de npm/corepack (inutiles à l'exécution, sources de CVE)
RUN apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
            /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  && addgroup -S -g 1001 kemdia && adduser -S -u 1001 -G kemdia kemdia
COPY --from=build --chown=kemdia:kemdia /repo/apps/web/.next/standalone ./
COPY --from=build --chown=kemdia:kemdia /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=kemdia:kemdia /repo/apps/web/public ./apps/web/public
USER kemdia
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["node", "apps/web/server.js"]
