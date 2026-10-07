# Kemdia 🇬🇦

Plateforme e-commerce pour le Gabon — paiement Mobile Money, livraison dans 13 villes.

[![CI](https://github.com/levy-kombila/kemdia/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![Sécurité](https://github.com/levy-kombila/kemdia/actions/workflows/security.yml/badge.svg)](../../actions/workflows/security.yml)

## Démarrage rapide

Prérequis : Node.js 22, pnpm 10 (guide Windows : [docs/guides/installation-windows.md](docs/guides/installation-windows.md)).

```bash
pnpm install
docker compose up -d db                     # PostgreSQL 18 (Docker Desktop requis)
pnpm --filter @kemdia/api db:deploy         # crée les tables
pnpm dev          # site http://localhost:3000 + API http://localhost:4000/api/health
```

Le site fonctionne seul (fichier de démonstration). Pour qu'il lise **l'API** (S3-T05) : `pnpm --filter @kemdia/api db:seed`,
puis mettre la **même clé** `API_INTERNAL_KEY` dans `apps/api/.env` et `apps/web/.env.local`, avec `API_URL=http://localhost:4000`
dans `apps/web/.env.local` (modèle : `apps/web/.env.example`). Guide : [docs/guides/base-de-donnees.md](docs/guides/base-de-donnees.md).

| Commande                                             | Rôle                                                                     |
| ---------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`                                           | Développement (site + API)                                               |
| `pnpm --filter @kemdia/api dev`                      | API seule                                                                |
| `pnpm test`                                          | Tests (Vitest)                                                           |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` | Qualité                                                                  |
| `pnpm build`                                         | Build de production                                                      |
| `docker compose up --build web`                      | Image de production en local                                             |
| `docker compose up -d db`                            | Base PostgreSQL locale                                                   |
| `docker compose up --build`                          | Tout le système en images de production (base → migrations → API → site) |

## Structure

```
apps/web/     Site client — Next.js 16, React 19, Tailwind 4
apps/api/     API — NestJS 12, monolithe modulaire, PostgreSQL 18 + Prisma 7 (Sprint 3, en construction)
packages/contracts/  Contrat partagé API ↔ site (schémas Zod, constantes, données de démonstration)
deploy/       Scripts et configuration du serveur (Caddy, déploiement)
docs/         Planning, rapports de sprint, cahier d'architecture, ADR, guides, sécurité
.github/      CI/CD (qualité, Docker, sécurité), Dependabot, modèles
```

## Documentation

- 📅 [Planning](docs/planning.md)
- 🏛️ [Cahier d'architecture](docs/architecture/cahier-architecture.md) et [décisions (ADR)](docs/architecture/adr/)
- 📘 [Comprendre l'architecture (concepts expliqués simplement)](docs/architecture/concepts.md)
- 📏 [Règles métier et exigences (BR / FR)](docs/architecture/regles-metier.md) · [Synthèse du KSAD](docs/references/ksad-synthese.md)
- 📝 [Rapports](docs/rapports/) — dernier : [S3-T07 — Démo Render avec l'API et une base Neon](docs/rapports/2026-10-07_S3-T07_demo-api.md)
- 🔐 [Politique de sécurité](SECURITY.md) · [Suivi de l'audit de l'ancienne version](docs/securite/heritage-audit-django.md)
- 🔌 [API : description OpenAPI](docs/api/openapi.json) — page interactive sur http://localhost:4000/api/docs (`pnpm --filter @kemdia/api dev`)
- 🗄️ [Base de données locale (PostgreSQL, migrations)](docs/guides/base-de-donnees.md)
- 🔀 [Workflow Git](docs/guides/workflow-git.md)
- 🚀 [Déploiement (CI/CD, serveur, mise en production)](docs/guides/deploiement.md)
- 🌍 [Démo publique gratuite (Render + Neon : site, API et base)](docs/guides/demo-gratuite.md)
