# ADR-0012 — Image Docker de l'API et migrations au déploiement

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Tâche** : S3-T06

## Contexte

L'API ([ADR-0007](0007-socle-api-nestjs.md)) et sa base ([ADR-0008](0008-postgresql-prisma.md)) doivent pouvoir être
déployées comme le site : **une image construite une fois**, scannée, puis promue sans reconstruction (_build once, deploy many_,
[ADR-0005](0005-strategie-deploiement.md)). Avant qu'une nouvelle version de l'API démarre, la structure de la base doit être à jour
(migrations Prisma). Aujourd'hui, seule une commande lancée sur un poste (`pnpm db:deploy`) applique les migrations.

Contraintes :

- l'image tourne **en lecture seule**, sans privilège, avec un utilisateur non-root (comme le site) ;
- Prisma 7 n'utilise plus de moteur natif **pour les requêtes** (pilote `pg`), mais `prisma migrate deploy` a toujours besoin
  de son **moteur de migrations**, téléchargé à part (bloqué volontairement à l'installation, voir `pnpm-workspace.yaml`) ;
- `@prisma/client` déclare `prisma` comme dépendance « pair » : l'outil Prisma est de toute façon présent dans les dépendances de production.

## Décision

| Sujet                  | Choix                                                                                                                                                                                       | Raison                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Une image, deux usages | `apps/api/Dockerfile` : par défaut l'API (`node dist/main.js`) ; en tâche ponctuelle les migrations (`node dist/database/migrate.js`)                                                       | Le code et les migrations d'une version voyagent ensemble : pas de décalage possible   |
| Outil de migration     | **`prisma migrate deploy`** (officiel), appelé par un petit script qui vérifie d'abord la configuration **comme l'API** et n'affiche aucune valeur                                          | Pas de réimplémentation ; la table `_prisma_migrations` reste celle que Prisma connaît |
| Moteur de migrations   | Téléchargé **à la construction** pour Alpine, rangé dans `/app/engines/schema-engine` (`PRISMA_SCHEMA_ENGINE_BINARY`) ; la construction échoue s'il manque                                  | Aucun téléchargement en production, fonctionne en lecture seule                        |
| Ordre au déploiement   | Migrations **puis** API ; si les migrations échouent (code ≠ 0), la nouvelle API ne démarre pas                                                                                             | L'ancienne version continue de servir ; jamais de code nouveau sur une base ancienne   |
| Compatibilité          | Règle « **ajouter d'abord, supprimer plus tard** » : une migration ne casse pas la version précédente de l'API                                                                              | Le retour arrière automatique redémarre l'ancienne image sur la base déjà migrée       |
| Dépendances            | `pnpm deploy --prod` : dossier autonome avec les seules dépendances de production ; `prisma` passe en dépendance de production                                                              | Pas d'outils de test ni de compilation dans l'image                                    |
| Durcissement           | Node 22 Alpine à jour, sans npm ni corepack, utilisateur `kemdia` (1001), fichiers de l'application appartenant à root, contrôle de santé intégré                                           | Même niveau que l'image du site ; l'API ne peut pas modifier son propre code           |
| Vérification           | CI : construction, **Trivy**, migrations sur une base **vide** (puis relance sans effet), refus d'une configuration fausse, base injoignable → échec, API en lecture seule → `database: ok` | L'image publiée est celle qui a été testée                                             |
| Publication            | GHCR `…/kemdia/api:sha-<commit>` et `:main` à chaque fusion ; `:vX.Y.Z` à la release, avec l'image du site                                                                                  | Une version = un site + une API, construits et testés ensemble                         |

## Options écartées

- **Migrations au démarrage de l'API** (dans `main.ts`) : plusieurs instances migreraient en même temps, et une migration longue bloquerait
  le démarrage et le contrôle de santé. Possible en dernier recours pour la démo gratuite (S3-T07) via la commande du conteneur.
- **Image séparée pour les migrations** : deux images à construire, scanner et promouvoir, avec un risque de décalage de version.
- **Runner SQL maison** (sans Prisma) : plus léger, mais il faudrait reproduire exactement le format de `_prisma_migrations` et ses verrous.
- **Retirer l'outil Prisma de l'image** pour la réduire : impossible proprement, `@prisma/client` le réclame (dépendance « pair »).

## Conséquences

- ➕ Déployer l'API = deux commandes avec la même image et les mêmes variables : migrations, puis API.
- ➕ `docker compose up --build` lance tout le système en local avec les images de production (base → migrations → API → site).
- ➖ Image assez lourde (l'outil Prisma et sa console d'administration pèsent ~200 Mo) ; sans effet sur la mémoire utilisée par l'API.
- ➖ Écrire une migration demande de la discipline (« ajouter d'abord, supprimer plus tard ») : rappelé dans le guide de la base.
- ➖ L'import des données de démonstration (`db:seed`) n'est pas dans l'image (il dépend d'outils de développement) : à traiter au S3-T07.
