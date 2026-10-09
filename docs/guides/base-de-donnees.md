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

Le site lit **toujours** le catalogue dans l'API (le fichier de démonstration a été retiré au S3-T08).
Il lui faut l'adresse de l'API et une clé partagée ; sans elles, il refuse de démarrer :

1. Générer une clé (une seule fois) :
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
2. Copier `apps/api/.env.example` en `apps/api/.env` et y mettre `API_INTERNAL_KEY=<la clé>`.
3. Copier `apps/web/.env.example` en `apps/web/.env.local` et y mettre `API_INTERNAL_KEY=<la même clé>` (`API_URL=http://localhost:4000` y est déjà).
4. `pnpm dev`. Le terminal du site affiche `Kemdia — catalogue : API http://localhost:4000`.

Sous **PowerShell**, écrire ces fichiers en ASCII (sinon Windows ajoute des caractères invisibles en tête de fichier et la variable n'est pas lue) :

```powershell
$cle = node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
Add-Content -Encoding ascii apps\api\.env "API_INTERNAL_KEY=$cle"
Set-Content -Encoding ascii apps\web\.env.local "API_URL=http://localhost:4000`nAPI_INTERNAL_KEY=$cle"
```

`Add-Content` **ajoute** la clé à `apps\api\.env` sans effacer ce qui s'y trouve déjà (par exemple `DATABASE_URL` avec le port 5433, voir
« En cas de problème »). N'utilisez pas `Set-Content` sur ce fichier : il le remplacerait entièrement.

Si l'API est arrêtée, les pages du catalogue affichent « Une erreur est survenue » : c'est voulu, le site ne bascule **jamais**
sur des données de secours ([ADR-0011](../architecture/adr/0011-site-branche-api.md)). Relancer l'API (`pnpm dev`) suffit.

## 4. Tout lancer avec les images de production (S3-T06)

Pour vérifier le système complet comme il tournera en ligne (Docker Desktop requis, `pnpm dev` arrêté) :

```bash
docker compose up --build        # base → migrations → API (port 4000) → site (port 3000)
pnpm --filter @kemdia/api db:seed   # dans un autre terminal, une fois : catalogue de démonstration
```

- `api-migrate` applique les migrations puis s'arrête (« exited with code 0 ») ; l'API ne démarre qu'après.
- Le site a besoin de `API_INTERNAL_KEY=<clé>` dans un fichier `.env` **à la racine** du dépôt ; sans elle, il refuse de démarrer (le reste démarre).
  PowerShell (clé générée comme au §3) : `Add-Content -Encoding ascii .env "API_INTERNAL_KEY=$cle"`.
- Dans l'image, les migrations se lancent avec `node dist/database/migrate.js` : c'est ce que fera chaque déploiement, avant la nouvelle API.

## 5. Modifier la structure de la base

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
| `migrate` (après `build`)                      | Même chose, par le script de l'image : configuration vérifiée comme l'API (S3-T06)           |
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

### Donner le rôle administrateur (S4-T06)

```bash
pnpm --filter @kemdia/api admin:grant  awa@exemple.ga   # compte déjà inscrit et vérifié
pnpm --filter @kemdia/api admin:revoke awa@exemple.ga
```

Le journal d'audit (`audit.events`) est en **ajout seul** : la base refuse de modifier ou d'effacer une ligne de moins de 365 jours,
même pour les tests. Pour repartir de zéro sur le poste : `docker compose down -v` (supprime toute la base locale).

## Règles à respecter

- **Ne jamais modifier une migration déjà fusionnée** dans `main` : elle a peut-être été appliquée en ligne. On en crée une nouvelle.
- **Ajouter d'abord, supprimer plus tard** : une migration ne doit pas casser la version précédente de l'API, car en cas de retour arrière
  l'ancienne version redémarre sur la base déjà migrée. Exemple pour renommer une colonne : PR 1 ajoute la nouvelle colonne et écrit dans les deux ;
  PR 2 (une fois en ligne) lit la nouvelle ; PR 3 supprime l'ancienne.
- Pas d'opération très longue (copie d'une grosse table…) sans en parler : le déploiement attend la fin des migrations (10 min au plus).
- Ne jamais copier une base réelle (avec des clients) sur un poste, ni l'envoyer dans Git (leçon CRIT-03 de l'ancien site).
- Ne jamais coller une `DATABASE_URL` de serveur dans un ticket, un message ou une capture : elle contient le mot de passe.

## En cas de problème

| Symptôme                                                                                             | Cause probable et solution                                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `port is already allocated` ou `An attempt was made to access a socket in a way forbidden` (Windows) | Le port 5432 est occupé ou **réservé par Windows** (Hyper-V/WSL). Utiliser 5433 : créer `.env` à la racine avec `POSTGRES_PORT=5433`, et `apps/api/.env` avec `DATABASE_URL=postgresql://kemdia:kemdia@localhost:5433/kemdia` (voir ci-dessous) |
| `/api/health` répond 503                                                                             | `docker compose up -d db`, puis attendre « healthy »                                                                                                                                                                                            |
| `password authentication failed`                                                                     | Base créée avant avec d'autres identifiants : `docker compose down -v` (⚠️ efface les données locales) puis `up -d db`                                                                                                                          |
| `P1000` (import ou API) alors que la base tourne                                                     | Mauvais port : la base écoute sur 5433 (voir ci-dessous) mais `apps/api/.env` ne contient plus `DATABASE_URL`. Vérifier avec `docker compose ps`, puis rajouter la ligne `DATABASE_URL`                                                         |
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
