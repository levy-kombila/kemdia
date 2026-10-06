# ADR-0008 — PostgreSQL 18 et Prisma 7 : un schéma par module, un seul historique de migrations

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Tâche** : S3-T02

## Contexte

L'[ADR-0006](0006-monolithe-modulaire-7-modules.md) impose **un schéma PostgreSQL par module** et **aucune jointure entre schémas**.
Le planning prévoit Prisma. Il faut décider comment organiser le schéma Prisma, les migrations et la connexion,
avant que le module `catalog` (S3-T03) n'y ajoute ses tables.

Prisma 7 a changé de fonctionnement : le client passe par le pilote JavaScript `pg` (« adaptateur »),
sans moteur natif à l'exécution ; la configuration est dans `prisma.config.ts`.

## Décision

| Sujet              | Choix                                                                                                                         | Raison                                                                                       |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Version            | **PostgreSQL 18** partout : poste (`docker compose`), CI, démo Render                                                         | Même comportement en développement et en ligne (parité)                                      |
| Client             | **Prisma 7.10** + adaptateur `@prisma/adapter-pg`                                                                             | Pas de binaire natif dans l'image de l'API ; pilote `pg` éprouvé                             |
| Organisation       | Dossier `prisma/schema/` : `main.prisma` (connexion) + **un fichier par module** (`catalog.prisma`…)                          | Chaque module voit ses modèles d'un coup d'œil                                               |
| Schémas PostgreSQL | `schemas = ["catalog", …]` ; chaque modèle porte `@@schema("<module>")`                                                       | Règle de l'ADR-0006                                                                          |
| Isolation          | Test `test/prisma-schema.test.ts` : schéma du bon module, **aucune relation vers un autre module** (on stocke un UUID)        | Interdit physiquement la jointure entre modules                                              |
| Migrations         | **Un seul historique** (`prisma/migrations/`), créé par `pnpm db:migrate`, appliqué par `pnpm db:deploy` au déploiement       | Un seul client, une seule commande ; l'ordre des changements reste clair                     |
| Contrôle en CI     | Base éphémère : migrations appliquées puis comparées au schéma (`db:check`), puis tests d'intégration                         | Une modification du schéma sans migration est refusée                                        |
| Connexion          | Groupe ≤ 10 connexions, ouverture ≤ 5 s, requête ≤ 10 s (`statement_timeout`), nom `kemdia-api-<env>` visible dans PostgreSQL | Une requête qui s'emballe ne bloque pas la base ; la démo gratuite accepte peu de connexions |
| Santé              | `/api/health` exécute `SELECT 1` (≤ 2 s) : **503** si la base ne répond pas                                                   | Le conteneur est marqué « unhealthy » ; l'API se reconnecte seule quand la base revient      |
| Adresse de la base | `DATABASE_URL`, vérifiée au démarrage ; adresse de développement **refusée en production** ; jamais journalisée               | Le mot de passe ne sort jamais de la variable d'environnement                                |

## Options écartées

- **Un client Prisma et un historique de migrations par module** : isolation maximale, mais 7 clients, 7 commandes de migration
  et 7 tables de suivi pour 2 développeurs. Le test d'isolation donne la même garantie pour le MVP ; la séparation reste possible
  plus tard, car aucun modèle ne référence un autre module.
- **`env("DATABASE_URL")` de Prisma** dans `prisma.config.ts` : il lève une erreur si la variable manque, ce qui casserait
  `prisma generate` en CI et dans l'image Docker, où aucune base n'est nécessaire. On lit `process.env` directement.
- **Créer la base au démarrage de l'API** (`db push`) : aucune trace des changements, risque de perte de données. Toujours des migrations.

## Reporté

- **Deux rôles PostgreSQL** (un propriétaire pour les migrations, un rôle applicatif sans droit de modifier les tables) : S7, avec le serveur de production.
- **Chiffrement de la connexion (TLS)** : selon l'hébergement retenu (réseau interne Render au S3-T07, serveur au S7).
- **Sauvegardes chiffrées et testées** : S7.

## Conséquences

- ➕ Les règles de l'ADR-0006 sont vérifiées automatiquement, côté code (ADR-0007) **et** côté base.
- ➕ L'API démarre même si la base est momentanément absente et le signale clairement.
- ➖ Le client Prisma est **généré** (`pnpm generate`, lancé automatiquement par Turborepo avant `lint`, `typecheck`, `test` et `build`) : il n'est pas dans Git.
- ➖ La première commande Prisma télécharge son moteur de migrations (site `binaries.prisma.sh`). Hors ligne : variables `PRISMA_ENGINES_MIRROR` ou `PRISMA_SCHEMA_ENGINE_BINARY`.
