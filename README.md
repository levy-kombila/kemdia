# Kemdia 🇬🇦

Plateforme e-commerce pour le Gabon — paiement Mobile Money, livraison dans 13 villes.

[![CI](https://github.com/levy-kombila/kemdia/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![Sécurité](https://github.com/levy-kombila/kemdia/actions/workflows/security.yml/badge.svg)](../../actions/workflows/security.yml)

## Démarrage rapide

Prérequis : Node.js 22, pnpm 10 (guide Windows : [docs/guides/installation-windows.md](docs/guides/installation-windows.md)).

```bash
pnpm install
pnpm dev          # site http://localhost:3000 + API http://localhost:4000/api/health
```

| Commande                                             | Rôle                         |
| ---------------------------------------------------- | ---------------------------- |
| `pnpm dev`                                           | Développement (site + API)   |
| `pnpm --filter @kemdia/api dev`                      | API seule                    |
| `pnpm test`                                          | Tests (Vitest)               |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` | Qualité                      |
| `pnpm build`                                         | Build de production          |
| `docker compose up --build`                          | Image de production en local |

## Structure

```
apps/web/     Site client — Next.js 16, React 19, Tailwind 4
apps/api/     API — NestJS 12, monolithe modulaire (Sprint 3, en construction)
deploy/       Scripts et configuration du serveur (Caddy, déploiement)
docs/         Planning, rapports de sprint, cahier d'architecture, ADR, guides, sécurité
.github/      CI/CD (qualité, Docker, sécurité), Dependabot, modèles
```

## Documentation

- 📅 [Planning](docs/planning.md)
- 🏛️ [Cahier d'architecture](docs/architecture/cahier-architecture.md) et [décisions (ADR)](docs/architecture/adr/)
- 📘 [Comprendre l'architecture (concepts expliqués simplement)](docs/architecture/concepts.md)
- 📏 [Règles métier et exigences (BR / FR)](docs/architecture/regles-metier.md) · [Synthèse du KSAD](docs/references/ksad-synthese.md)
- 📝 [Rapports](docs/rapports/) — dernier : [S3-T01 — socle de l'API](docs/rapports/2026-10-06_S3-T01_socle-api.md)
- 🔐 [Politique de sécurité](SECURITY.md) · [Suivi de l'audit de l'ancienne version](docs/securite/heritage-audit-django.md)
- 🔀 [Workflow Git](docs/guides/workflow-git.md)
- 🚀 [Déploiement (CI/CD, serveur, mise en production)](docs/guides/deploiement.md)
- 🌍 [Démo publique gratuite (Render)](docs/guides/demo-gratuite.md)
