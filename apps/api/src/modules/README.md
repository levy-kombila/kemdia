# Modules métier de l'API

Un dossier par module ([ADR-0006](../../../../docs/architecture/adr/0006-monolithe-modulaire-7-modules.md)) :
`catalog` (S3), `identity` et `notifications` (S4), `orders` et `payments` (S5), `vendors` (S6), `shipping` (S7).

## Organisation d'un module (architecture hexagonale)

```
src/modules/catalog/
├── index.ts          Port public : la SEULE porte d'entrée pour les autres modules
├── catalog.module.ts Assemblage NestJS
├── domain/           Règles métier pures (entités, valeurs, erreurs) — aucun framework, aucune base
├── application/      Cas d'utilisation + interfaces (« ports ») dont ils ont besoin (ex. ProductRepository)
├── infrastructure/   Implémentations des ports (Prisma, services externes)
└── interface/        Contrôleurs HTTP, schémas de validation des requêtes
```

Les dépendances vont **vers l'intérieur** : `interface` et `infrastructure` → `application` → `domain`.

## Règles vérifiées automatiquement

Le test `test/architecture.test.ts` échoue si :

1. `domain/` importe un framework (`@nestjs/*`, Prisma, Express, Zod…) ou une autre couche ;
2. `application/` importe `infrastructure/`, `interface/`, Prisma ou Express ;
3. un module importe un fichier d'un autre module autrement que par son `index.ts`.
