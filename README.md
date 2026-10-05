# Kemdia 🇬🇦

Plateforme e-commerce pour le Gabon — paiement Mobile Money, livraison dans 13 villes.

[![CI](https://github.com/levy-kombila/kemdia/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![Sécurité](https://github.com/levy-kombila/kemdia/actions/workflows/security.yml/badge.svg)](../../actions/workflows/security.yml)

## Démarrage rapide

Prérequis : Node.js 22, pnpm 10 (guide Windows : [docs/guides/installation-windows.md](docs/guides/installation-windows.md)).

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

| Commande                                             | Rôle                         |
| ---------------------------------------------------- | ---------------------------- |
| `pnpm dev`                                           | Développement                |
| `pnpm test`                                          | Tests (Vitest)               |
| `pnpm lint` / `pnpm typecheck` / `pnpm format:check` | Qualité                      |
| `pnpm build`                                         | Build de production          |
| `docker compose up --build`                          | Image de production en local |

## Structure

```
apps/web/     Site client — Next.js 16, React 19, Tailwind 4
deploy/       Scripts et configuration du serveur (Caddy, déploiement)
docs/         Planning, rapports de sprint, cahier d'architecture, ADR, guides, sécurité
.github/      CI/CD (qualité, Docker, sécurité), Dependabot, modèles
```

## Documentation

- 📅 [Planning](docs/planning.md)
- 🏛️ [Cahier d'architecture](docs/architecture/cahier-architecture.md) et [décisions (ADR)](docs/architecture/adr/)
- 📝 [Rapports](docs/rapports/) — dernier : [Sprint 1](docs/rapports/2026-10-05_S1_fondations-frontend.md)
- 🔐 [Politique de sécurité](SECURITY.md) · [Suivi de l'audit de l'ancienne version](docs/securite/heritage-audit-django.md)
- 🔀 [Workflow Git](docs/guides/workflow-git.md)
- 🚀 [Déploiement (CI/CD, serveur, mise en production)](docs/guides/deploiement.md)
