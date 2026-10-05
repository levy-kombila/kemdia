# ADR-0003 — Monorepo pnpm + Turborepo

- **Statut** : Accepté
- **Date** : 2026-10-05

## Décision

Un seul dépôt Git contenant :

```
apps/web        → site client (Next.js)          [S1]
apps/api        → API (NestJS)                   [S3]
apps/admin      → back-office (option)           [S6]
packages/*      → code partagé (types, validation, UI)
docs/           → planning, rapports, cahier d'architecture, guides
```

- **pnpm** : installation rapide, `pnpm-lock.yaml` garantit des versions identiques partout (`--frozen-lockfile` en CI).
- **Turborepo** : lance `lint`, `test`, `build` sur toutes les applications et met en cache les résultats.

## Conséquences

- Une PR peut modifier l'API et le site en même temps, testés ensemble.
- La CI reste unique ; chaque application garde son propre `package.json`.
