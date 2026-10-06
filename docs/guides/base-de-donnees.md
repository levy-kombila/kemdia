# Base de données locale (PostgreSQL) — guide pratique

> Pour développer l'API sur son poste. Décision technique : [ADR-0008](../architecture/adr/0008-postgresql-prisma.md).
> Prérequis : **Docker Desktop** démarré (Windows : voir [installation-windows.md](installation-windows.md)).

## 1. Démarrer la base

```bash
docker compose up -d db          # PostgreSQL 18, en arrière-plan
docker compose ps                # la colonne STATUS doit afficher « healthy »
```

La base n'est accessible **que depuis ce poste** (adresse `127.0.0.1`, port `5432`).
Identifiants de développement : utilisateur `kemdia`, mot de passe `kemdia`, base `kemdia`.
Ils ne servent qu'ici ; en ligne, l'adresse de la base vient du serveur (variable `DATABASE_URL`).

## 2. Créer les tables (appliquer les migrations)

```bash
pnpm install
pnpm --filter @kemdia/api db:deploy   # applique les migrations du dépôt
pnpm --filter @kemdia/api db:seed     # catalogue de démonstration : 112 catégories, 50 produits
pnpm --filter @kemdia/api dev         # API sur http://localhost:4000/api/health
```

`/api/health` doit afficher `"database":"ok"`. Sinon, il répond **503** avec `"database":"indisponible"` : la base n'est pas démarrée.

L'API trouve la base toute seule (adresse par défaut en développement). Pour en changer : copier `apps/api/.env.example`
en `apps/api/.env` et modifier `DATABASE_URL`. Le fichier `.env` n'est **jamais** envoyé dans Git.

## 3. Modifier la structure de la base

1. Modifier le fichier du module dans `apps/api/prisma/schema/` (ex. `catalog.prisma`).
   Chaque modèle porte `@@schema("<module>")`, et **aucune relation vers un autre module** : on garde seulement son identifiant (UUID).
2. Créer la migration :
   ```bash
   pnpm --filter @kemdia/api db:migrate --name ajout-variantes
   ```
   Prisma écrit le SQL dans `prisma/migrations/<date>_ajout-variantes/migration.sql`, l'applique, et régénère le client.
3. **Relire le SQL** puis l'ajouter au commit, avec le changement de schéma.

La CI vérifie que les migrations correspondent exactement au schéma : un oubli fait échouer la PR.

## Commandes utiles

| Commande (préfixe `pnpm --filter @kemdia/api`) | Rôle                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| `db:migrate --name <nom>`                      | Créer et appliquer une migration (poste de développement uniquement)                 |
| `db:deploy`                                    | Appliquer les migrations existantes (c'est aussi ce que fait le serveur)             |
| `db:status`                                    | Voir les migrations appliquées ou en attente                                         |
| `db:check`                                     | Vérifier que la base correspond au schéma (code 2 = écart)                           |
| `db:seed`                                      | Importer le catalogue de démonstration (relançable ; refusé en production)           |
| `db:reset`                                     | ⚠️ **Effacer** la base locale et rejouer les migrations (relancer ensuite `db:seed`) |
| `generate`                                     | Régénérer le client Prisma (automatique avant lint, types, tests, build)             |
| `test:int`                                     | Tests d'intégration sur une base **de test** (nom finissant par `_test`)             |

Les tests d'intégration **vident les tables du catalogue**. Ils refusent donc de tourner sur une base dont le nom
ne finit pas par `_test` : ta base de développement (`kemdia`) est protégée. Pour les lancer en local :

```bash
docker compose exec db createdb -U kemdia kemdia_test       # une seule fois
export DATABASE_URL=postgresql://kemdia:kemdia@localhost:5432/kemdia_test
pnpm --filter @kemdia/api db:deploy
pnpm --filter @kemdia/api test:int
```

(PowerShell : `$env:DATABASE_URL="postgresql://kemdia:kemdia@localhost:5432/kemdia_test"` au lieu de `export`.)

## Règles à respecter

- **Ne jamais modifier une migration déjà fusionnée** dans `main` : elle a peut-être été appliquée en ligne. On en crée une nouvelle.
- Ne jamais copier une base réelle (avec des clients) sur un poste, ni l'envoyer dans Git (leçon CRIT-03 de l'ancien site).
- Ne jamais coller une `DATABASE_URL` de serveur dans un ticket, un message ou une capture : elle contient le mot de passe.

## En cas de problème

| Symptôme                                     | Cause probable et solution                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `port is already allocated` au démarrage     | Un autre PostgreSQL occupe le port 5432 : l'arrêter, ou créer un `.env` à la racine avec `POSTGRES_PORT=5433` (et l'adapter dans `DATABASE_URL`) |
| `/api/health` répond 503                     | `docker compose up -d db`, puis attendre « healthy »                                                                                             |
| `password authentication failed`             | Base créée avant avec d'autres identifiants : `docker compose down -v` (⚠️ efface les données locales) puis `up -d db`                           |
| Prisma n'arrive pas à télécharger son moteur | Connexion coupée ou filtrée vers `binaries.prisma.sh` : réessayer, ou définir `PRISMA_ENGINES_MIRROR`                                            |
| `Cannot find module '…/generated/prisma/…'`  | Client non généré : `pnpm --filter @kemdia/api generate`                                                                                         |

## Tout arrêter

```bash
docker compose stop db      # arrête la base, les données sont conservées
docker compose down -v      # ⚠️ supprime aussi les données locales
```
