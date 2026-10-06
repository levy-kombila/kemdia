# Rapport — PostgreSQL et Prisma

|                                                 |                                                                |
| ----------------------------------------------- | -------------------------------------------------------------- |
| **Date**                                        | 2026-10-06                                                     |
| **Sprint / tâches**                             | S3 — S3-T02                                                    |
| **Version**                                     | v0.3.0 (en cours)                                              |
| **Sections du cahier d'architecture modifiées** | §3.2, §3.4, §3.5 (nouvelle), §4, §6.3, §6.4, §7, §8, §9 (v1.2) |

## 1. Résumé

L'API a maintenant une **base de données PostgreSQL 18**, utilisée avec **Prisma 7**. Sur son poste, une commande
(`docker compose up -d db`) la démarre ; une autre (`pnpm --filter @kemdia/api db:deploy`) crée sa structure.
La règle de l'architecture « un schéma PostgreSQL par module, aucune jointure entre modules » est **vérifiée automatiquement**.
Le schéma `catalog` existe mais il est vide : les tables (catégories, produits, variantes, stock) arrivent au S3-T03.

## 2. Fonctionnalités livrées

| Élément                  | Ce que ça fait, en simple                                                                                                       | Fichiers principaux                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Base locale              | PostgreSQL 18 dans Docker, joignable **seulement depuis le poste**, données conservées entre deux redémarrages                  | `docker-compose.yml`                                 |
| Schéma Prisma par module | `main.prisma` (connexion) + un fichier par module ; chaque modèle rangé dans le schéma PostgreSQL de son module                 | `apps/api/prisma/schema/`                            |
| Migrations               | Historique SQL des changements de structure ; la première crée le schéma `catalog`                                              | `apps/api/prisma/migrations/`                        |
| Connexion de l'API       | Au plus 10 connexions ; une requête SQL de plus de 10 s est coupée ; chaque connexion porte le nom `kemdia-api-<environnement>` | `apps/api/src/database/prisma.service.ts`            |
| Santé de la base         | `/api/health` vérifie la base : **200** si elle répond, **503** sinon ; l'API se reconnecte seule quand la base revient         | `src/database/database-health.ts`, `src/health/`     |
| Configuration            | `DATABASE_URL`, `DATABASE_POOL_MAX`, `DATABASE_STATEMENT_TIMEOUT_MS`, vérifiées au démarrage                                    | `src/config/env.ts`, `.env.example`                  |
| Garde-fous automatiques  | Tests qui refusent : relation entre modules, modèle mal rangé, accès à la base hors de la couche `infrastructure/`              | `test/prisma-schema.test.ts`, `test/architecture.ts` |
| CI                       | Nouveau job : base vide → migrations → **vérification migrations = schéma** → tests d'intégration                               | `.github/workflows/ci.yml`                           |
| Guide pratique           | Démarrer la base, créer une migration, commandes, problèmes fréquents (Windows compris)                                         | `docs/guides/base-de-donnees.md`                     |

**Ce qu'on a vérifié à la main** (API construite, mode production, vrai PostgreSQL) :

```
GET /api/health  → 200  {"status":"ok", …, "checks":{"database":"ok"}}
(arrêt de PostgreSQL)
GET /api/health  → 503  {"status":"degrade", …, "checks":{"database":"indisponible"}}
(redémarrage de PostgreSQL)
GET /api/health  → 200  {"status":"ok", …, "checks":{"database":"ok"}}
```

Le mot de passe de la base n'apparaît nulle part dans les journaux.

## 3. Décisions techniques

[ADR-0008](../architecture/adr/0008-postgresql-prisma.md) — en résumé :

- **PostgreSQL 18** partout (poste, CI, démo Render qui le propose) : même comportement en développement et en ligne.
- **Un fichier Prisma par module**, mais **un seul historique de migrations** : plus simple pour 2 développeurs,
  et le test d'isolation garantit qu'on pourra séparer un module plus tard.
- **Prisma 7 sans moteur natif à l'exécution** : il passe par le pilote JavaScript `pg`. L'image de l'API sera plus légère.
- Le client Prisma est **généré** (pas dans Git) ; Turborepo le génère tout seul avant le lint, les types, les tests et la construction.

## 4. Sécurité

| Mesure                                                                                                | Risque couvert                           |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `DATABASE_URL` jamais journalisée ; mot de passe masqué si un message d'erreur du pilote le recopiait | Fuite d'identifiants (CRIT-02)           |
| En production, l'adresse de développement est refusée : l'API ne démarre pas                          | Production branchée sur une base de test |
| Toutes les valeurs passent en paramètres SQL (testé avec `'; DROP SCHEMA catalog CASCADE; --`)        | Injection SQL                            |
| Requête coupée après 10 s, au plus 10 connexions                                                      | Base saturée                             |
| Base locale sur `127.0.0.1` uniquement, mots de passe vérifiés en SCRAM-SHA-256                       | Base exposée sur le Wi-Fi                |
| **Failles corrigées dans l'outil Prisma** : versions sûres de `mysql2` et `deepmerge-ts` imposées     | 2 failles hautes, 1 moyenne              |

À propos de la dernière ligne : `pnpm audit` a signalé 3 failles dans deux sous-dépendances de l'outil Prisma 7.10
(utilisées par la ligne de commande seulement, pas par l'API en marche). La CI aurait bloqué la PR.
J'ai imposé les versions corrigées (`overrides` dans `pnpm-workspace.yaml`) et vérifié que Prisma fonctionne toujours.
À retirer quand Prisma les livrera lui-même. Résultat : `pnpm audit --prod` → 0 vulnérabilité.

**Reporté au S7** (préproduction) : deux rôles PostgreSQL distincts (migrations / application), connexion chiffrée selon l'hébergeur, sauvegardes.

## 5. Qualité

- **49 tests** unitaires de l'API (+14), dont la santé de la base (ok, erreur, délai dépassé), la configuration de la base,
  les règles du schéma Prisma (6) et l'accès à la base réservé à `infrastructure/`.
- **6 tests d'intégration** sur un **vrai PostgreSQL** : santé, schéma `catalog` créé par la migration, requête trop longue coupée,
  injection SQL, nom de connexion, base injoignable → 503 sans fuite. Tous verts en local.
- Site : 120 tests inchangés et verts. Lint, types, construction : ✅.

### Point d'attention : la migration initiale a été écrite à la main

Mon environnement de travail ne peut pas télécharger le moteur de migrations de Prisma (site `binaries.prisma.sh` filtré).
Sur ton poste et sur GitHub, ce téléchargement fonctionne normalement.
J'ai donc écrit la première migration à la main : une seule ligne, `CREATE SCHEMA IF NOT EXISTS "catalog"`, au format exact de Prisma.
**La CI la contrôle** : elle applique les migrations sur une base vide, puis Prisma compare le résultat au schéma (`db:check`).
Le job est vert, donc la migration correspond exactement à ce que Prisma aurait produit.

### Sur le découpage du planning

Le planning plaçait les « tests d'intégration avec une base éphémère en CI » au **S3-T06**.
J'en ai avancé la partie base de données dans cette tâche : sans elle, la migration et la connexion n'auraient été vérifiées par aucun robot.
Il reste au S3-T06 : l'image Docker de l'API, avec l'application des migrations au déploiement.

## 6. Captures d'écran

Sans objet (aucune interface).

## 7. Limites connues / dette technique

- Les migrations ne sont pas encore appliquées automatiquement au déploiement (S3-T06 / T07 : image et démo de l'API).
- Les sous-dépendances imposées à Prisma (`overrides`) sont à retirer quand Prisma les mettra à jour (Dependabot ouvrira la PR).

## 8. Prochaines étapes

**S3-T03** : module `catalog` — catégories (3 niveaux), produits, **variantes** avec leur propre stock, identifiants UUID
(BR-001, BR-042, FR-013), import des 112 catégories et 50 produits de démonstration.

## Comment essayer (Docker Desktop requis)

```bash
docker compose up -d db
pnpm install
pnpm --filter @kemdia/api db:deploy
pnpm --filter @kemdia/api dev        # http://localhost:4000/api/health → "database":"ok"
```
