# syntax=docker/dockerfile:1.7
# Image de production de l'API (S3-T06). Construite depuis la racine du dépôt :
#   docker build -f apps/api/Dockerfile -t kemdia-api .
#
# Une seule image, deux usages (principe « build once, deploy many ») :
#   - par défaut          : l'API                       → node dist/main.js
#   - tâche ponctuelle    : les migrations de la base   → node dist/database/migrate.js
# Le déploiement lance les migrations PUIS la nouvelle API, avec la même image et les mêmes variables.

FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN corepack enable

FROM base AS build
WORKDIR /repo
# openssl : Prisma s'en sert pour choisir la bonne version de son moteur (linux-musl-openssl-3.0.x)
RUN apk add --no-cache openssl
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/contracts/package.json packages/contracts/
# Dépendances de l'API et de ses paquets internes uniquement (pas celles du site).
# --ignore-scripts : les scripts (client Prisma, construction du contrat) ont besoin des sources, lancés plus bas.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@kemdia/api..." --ignore-scripts
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @kemdia/contracts build \
 && pnpm --filter @kemdia/api generate \
 && pnpm --filter @kemdia/api build
# Dépendances de PRODUCTION seules, dans un dossier autonome (le contrat partagé y est copié, déjà construit)
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm --filter @kemdia/api deploy --legacy --prod --ignore-scripts /out
# Moteur de migrations téléchargé ICI, une fois : l'image tourne en lecture seule et sans accès à Internet requis
RUN node apps/api/scripts/fetch-schema-engine.mjs /out /out/engines/schema-engine

FROM node:22-alpine AS runner
WORKDIR /app
# Version inscrite dans l'image (sha-<commit>) : exposée par /api/health
ARG APP_VERSION=dev
ENV NODE_ENV=production APP_ENV=production APP_VERSION=$APP_VERSION \
    HOST=0.0.0.0 PORT=4000 \
    PRISMA_SCHEMA_ENGINE_BINARY=/app/engines/schema-engine \
    CHECKPOINT_DISABLE=1 PRISMA_HIDE_UPDATE_MESSAGE=1
# Correctifs de sécurité de l'OS + suppression de npm/corepack (inutiles à l'exécution, sources de CVE)
RUN apk upgrade --no-cache \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
            /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  && addgroup -S -g 1001 kemdia && adduser -S -u 1001 -G kemdia kemdia
# Fichiers appartenant à root, en lecture seule pour l'utilisateur de l'API : il ne peut pas modifier son propre code
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/engines ./engines
COPY --from=build /repo/apps/api/package.json /repo/apps/api/prisma.config.ts ./
COPY --from=build /repo/apps/api/prisma/schema ./prisma/schema
COPY --from=build /repo/apps/api/prisma/migrations ./prisma/migrations
COPY --from=build /repo/apps/api/dist ./dist
USER kemdia
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/health" >/dev/null || exit 1
CMD ["node", "dist/main.js"]
