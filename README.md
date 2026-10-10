# Kemdia 🇬🇦

Plateforme e-commerce pour le Gabon — paiement Mobile Money, livraison dans 13 villes.

[![CI](https://github.com/levy-kombila/kemdia/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![Sécurité](https://github.com/levy-kombila/kemdia/actions/workflows/security.yml/badge.svg)](../../actions/workflows/security.yml)

## Démarrage rapide

Prérequis : Node.js 22, pnpm 10 (guide Windows : [docs/guides/installation-windows.md](docs/guides/installation-windows.md)).

**Une seule fois** — le site lit toujours le catalogue dans l'API (S3-T08), qui a besoin de sa base :

1. Copier les modèles de configuration (PowerShell compris, une commande par ligne) :
   `copy apps/api/.env.example apps/api/.env` puis `copy apps/web/.env.example apps/web/.env.local`
2. Générer une clé : `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`,
   et la coller dans **les deux** fichiers, sur la ligne `API_INTERNAL_KEY=` (jamais dans Git).
   Version PowerShell qui écrit les deux fichiers d'un coup : [base-de-donnees.md §3](docs/guides/base-de-donnees.md#3-brancher-le-site-sur-lapi-s3-t05).
   Ne jamais **remplacer** `apps/api/.env` s'il existe déjà (il peut contenir `DATABASE_URL`, par exemple pour le port 5433) : y **ajouter** la ligne.

Puis, à chaque fois (Docker Desktop lancé) :

```bash
pnpm install
docker compose up -d db                     # PostgreSQL 18
pnpm --filter @kemdia/api db:deploy         # crée ou met à jour les tables
pnpm --filter @kemdia/api db:seed           # catalogue de démonstration (relançable sans doublon)
pnpm dev          # site http://localhost:3000 + API http://localhost:4000/api/health
```

Sans `API_URL` ou sans la clé, le site refuse de démarrer et nomme la variable manquante.
Guide : [docs/guides/base-de-donnees.md](docs/guides/base-de-donnees.md).

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
apps/api/     API — NestJS 12, monolithe modulaire, PostgreSQL 18 + Prisma 7 — modules `catalog`, `identity` (comptes, rôles), `audit` et `orders` (panier, commandes)
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
- 📝 [Rapports](docs/rapports/) — dernier : [S5-T02 — commandes](docs/rapports/2026-10-10_S5-T02_commandes.md)
- 🔐 [Politique de sécurité](SECURITY.md) · [Suivi de l'audit de l'ancienne version](docs/securite/heritage-audit-django.md)
- 🔌 [API : description OpenAPI](docs/api/openapi.json) — page interactive sur http://localhost:4000/api/docs (`pnpm --filter @kemdia/api dev`)
- 🗄️ [Base de données locale (PostgreSQL, migrations)](docs/guides/base-de-donnees.md)
- 🔀 [Workflow Git](docs/guides/workflow-git.md)
- 🚀 [Déploiement (CI/CD, serveur, mise en production)](docs/guides/deploiement.md)
- 🌍 [Démo publique gratuite (Render + Neon : site, API et base)](docs/guides/demo-gratuite.md)
