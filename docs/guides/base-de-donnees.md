# Base de données locale (PostgreSQL) — guide pratique

> Pour développer l'API sur son poste. Décision technique : [ADR-0008](../architecture/adr/0008-postgresql-prisma.md).
> Prérequis : **Docker Desktop** démarré (Windows : voir [installation-windows.md](installation-windows.md)).
>
> 🪟 **PowerShell** : tapez les commandes **une par une**. Windows PowerShell 5.1 ne connaît pas `&&`
> (erreur « Le jeton '&&' n'est pas un séparateur d'instruction valide »).

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
pnpm install                          # à relancer après chaque « git pull » ; génère aussi le client Prisma
pnpm --filter @kemdia/api db:deploy   # applique les migrations du dépôt
pnpm --filter @kemdia/api db:seed     # catalogue de démonstration : 112 catégories, 50 produits
pnpm --filter @kemdia/api dev         # API sur http://localhost:4000/api/health
```

`/api/health` doit afficher `"database":"ok"`. Sinon, il répond **503** avec `"database":"indisponible"` : la base n'est pas démarrée.

L'API trouve la base toute seule (adresse par défaut en développement). Pour en changer : copier `apps/api/.env.example`
en `apps/api/.env` et modifier `DATABASE_URL`. Le fichier `.env` n'est **jamais** envoyé dans Git.

## 3. Brancher le site sur l'API (S3-T05)

Sans réglage, le site lit le **fichier de démonstration**. Pour qu'il lise l'API (et donc la base) :

1. Générer une clé (une seule fois) :
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
2. Copier `apps/api/.env.example` en `apps/api/.env` et y mettre `API_INTERNAL_KEY=<la clé>`.
3. Copier `apps/web/.env.example` en `apps/web/.env.local`, décommenter `API_URL=http://localhost:4000` et `API_INTERNAL_KEY=<la même clé>`.
4. `pnpm dev`. Le terminal du site affiche `Kemdia — catalogue : API http://localhost:4000`.

Sous **PowerShell**, écrire ces fichiers en ASCII (sinon Windows ajoute des caractères invisibles en tête de fichier et la variable n'est pas lue) :

```powershell
$cle = node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
Set-Content -Encoding ascii apps\api\.env "API_INTERNAL_KEY=$cle"
Set-Content -Encoding ascii apps\web\.env.local "API_URL=http://localhost:4000`nAPI_INTERNAL_KEY=$cle"
```

Si l'API est arrêtée, les pages du catalogue affichent « Une erreur est survenue » : c'est voulu, le site ne bascule **jamais**
tout seul sur le fichier ([ADR-0011](../architecture/adr/0011-site-branche-api.md)). Pour revenir au fichier : retirer `API_URL` de `apps/web/.env.local`.

## 4. Modifier la structure de la base

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

| Commande (préfixe `pnpm --filter @kemdia/api`) | Rôle                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `db:migrate --name <nom>`                      | Créer et appliquer une migration (poste de développement uniquement)                         |
| `db:deploy`                                    | Appliquer les migrations existantes (c'est aussi ce que fait le serveur)                     |
| `db:status`                                    | Voir les migrations appliquées ou en attente                                                 |
| `db:check`                                     | Vérifier que la base correspond au schéma (code 2 = écart)                                   |
| `db:seed`                                      | Importer le catalogue de démonstration (relançable ; refusé en production)                   |
| `db:reset`                                     | ⚠️ **Effacer** la base locale et rejouer les migrations (relancer ensuite `db:seed`)         |
| `generate`                                     | Régénérer le client Prisma (automatique à `pnpm install` et avant lint, types, tests, build) |
| `test:int`                                     | Tests d'intégration sur une base **de test** (nom finissant par `_test`)                     |

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

| Symptôme                                                                                             | Cause probable et solution                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `port is already allocated` ou `An attempt was made to access a socket in a way forbidden` (Windows) | Le port 5432 est occupé ou **réservé par Windows** (Hyper-V/WSL). Utiliser 5433 : créer `.env` à la racine avec `POSTGRES_PORT=5433`, et `apps/api/.env` avec `DATABASE_URL=postgresql://kemdia:kemdia@localhost:5433/kemdia` (voir ci-dessous) |
| `/api/health` répond 503                                                                             | `docker compose up -d db`, puis attendre « healthy »                                                                                                                                                                                            |
| `password authentication failed`                                                                     | Base créée avant avec d'autres identifiants : `docker compose down -v` (⚠️ efface les données locales) puis `up -d db`                                                                                                                          |
| Prisma n'arrive pas à télécharger son moteur                                                         | Connexion coupée ou filtrée vers `binaries.prisma.sh` : réessayer, ou définir `PRISMA_ENGINES_MIRROR`                                                                                                                                           |
| `Cannot find module '…/generated/prisma/…'`                                                          | Client non généré : relancer `pnpm install` (ou `pnpm --filter @kemdia/api generate`)                                                                                                                                                           |
| `prisma n'est pas reconnu…`                                                                          | Toujours passer par pnpm : `pnpm --filter @kemdia/api db:deploy`, jamais `prisma` seul                                                                                                                                                          |
| Erreur bizarre juste après un `git pull`                                                             | Nouvelles dépendances : `pnpm install`                                                                                                                                                                                                          |
| Le site refuse de démarrer (`Configuration du site invalide`)                                        | Lire le message : `API_URL` sans `API_INTERNAL_KEY`, ou clé trop courte (32 caractères au moins)                                                                                                                                                |

**Port 5433 sous PowerShell** (fichiers en ASCII, une commande par ligne) :

```powershell
Set-Content -Encoding ascii .env "POSTGRES_PORT=5433"
Add-Content -Encoding ascii apps\api\.env "DATABASE_URL=postgresql://kemdia:kemdia@localhost:5433/kemdia"
docker compose up -d db
```

## Tout arrêter

```bash
docker compose stop db      # arrête la base, les données sont conservées
docker compose down -v      # ⚠️ supprime aussi les données locales
```
