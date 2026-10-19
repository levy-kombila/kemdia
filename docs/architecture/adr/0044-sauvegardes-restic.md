# ADR-0044 — Sauvegardes chiffrées (restic, local + S3) et restauration testée

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Tâche** : S7-T05
- **Complète** : [ADR-0043](0043-serveur-pile-complete.md) (pile du serveur), [ADR-0008](0008-postgresql-prisma.md)
  (« sauvegardes chiffrées et testées : S7 »)

## Contexte

Depuis le S7-T04, chaque environnement du serveur a sa propre base PostgreSQL dans Docker. Aucune sauvegarde
n'existait. Les photos des produits sont aussi dans la base (ADR-0035). Les dossiers des vendeurs et les doubles
authentifications sont chiffrés avec des clés qui n'existent que sur le serveur (ADR-0043). Une sauvegarde de la base
sans ces clés ne rendrait donc pas ces données lisibles.

Choix du propriétaire (2026-10-19) :

| Question             | Choix                                                                                                |
| -------------------- | ---------------------------------------------------------------------------------------------------- |
| Où                   | **Sur le serveur + stockage S3** (ex. Cloudflare R2) ; local seulement tant que S3 n'est pas branché |
| Outil                | **restic** : chiffrement, rétention et vérification intégrés                                         |
| Fréquence            | **Chaque nuit**, rétention 7 jours / 4 semaines / 6 mois                                             |
| Test de restauration | **Complet** : contenu comparé table par table, API démarrée sur la base restaurée                    |

## Décision

1. **`backup.sh`** (root, minuteur systemd chaque nuit à 02:00, avant les redémarrages de 03:30) :
   - pour chaque environnement déployé, `pg_dump` au format « custom » non compressé **dans le conteneur
     PostgreSQL** (même version que la base), envoyé directement à `restic backup --stdin` : aucune copie en clair
     sur le disque. Si `pg_dump` échoue en route, la sauvegarde tronquée enregistrée par restic 0.16 (Ubuntu 24.04)
     est aussitôt supprimée ;
   - `/opt/kemdia/secrets` (sauf le mot de passe des sauvegardes et l'accès S3) et le `.env` de Caddy ;
   - rétention `--keep-daily 7 --keep-weekly 4 --keep-monthly 6`, `restic check` ;
   - copie vers le dépôt S3 (`restic copy`), puis même rétention là-bas ;
   - résultat dans `/opt/kemdia/state/backup.last`, que la surveillance (S7-T06) lira.
2. **Chiffrement** : AES-256 de restic, mot de passe aléatoire de 64 caractères dans
   `/opt/kemdia/secrets/backup.password` (0600 root), à copier dans le gestionnaire de mots de passe du propriétaire.
   Le compte `deploy` (CI) ne le lit pas. L'accès S3 est dans `backup-s3.env` (0600 root). Seules quatre clés connues y
   sont lues ; le fichier n'est jamais exécuté.
3. **`restore.sh`** : `liste`, `fichiers` (extrait les secrets dans un dossier vide, ne remplace rien), `verifier`
   (restaure dans une base temporaire `kemdia_verif`, puis la supprime ; la base en service n'est pas touchée) et
   `remplacer` (exige `--confirmer <env>`, prend le verrou de `deploy.sh`, vérifie que la sauvegarde existe **avant**
   d'arrêter quoi que ce soit). `--s3` lit le dépôt hors du serveur.
4. **Vérification hebdomadaire** : minuteur le dimanche à 05:00 (`restore.sh verifier` + relecture de 10 % du dépôt).
5. **CI (job « Pile serveur »)** : base remplie avec le catalogue de démonstration, puis sauvegarde vers le dépôt local
   et un S3 de test (MinIO). Le job vérifie ensuite :
   - pas de donnée en clair dans le dépôt, mauvais mot de passe refusé ;
   - secrets récupérables, mais pas le mot de passe des sauvegardes ;
   - vérification hebdomadaire réussie.

   Il simule enfin la **perte du serveur** : base et dépôt local effacés. La restauration depuis S3 doit redonner une
   base au contenu identique table par table (nombre de lignes et MD5), avec le site et l'API en ligne.

## Conséquences

- Perte maximale : les données d'une journée (sauvegarde nocturne).
- Restaurer après la perte du serveur demande deux choses gardées hors du serveur : le mot de passe des sauvegardes
  et l'accès S3. Les clés TOTP et KYC sont dans la sauvegarde.
- Place : le dépôt déduplique (un dump non compressé change peu d'un jour à l'autre) puis compresse. Les 10 Go
  gratuits de R2 suffisent pour le lancement ; à surveiller avec les photos.
- `pg_dump` est cohérent sans arrêter le site : une seule transaction, en lecture.

## Alternatives écartées

- **pg_dump + age** : simple, mais rétention, copie S3 et vérification à écrire nous-mêmes.
- **Sauvegarde du volume Docker** : il faudrait arrêter la base, sinon la copie est incohérente ; elle ne se restaure
  qu'avec la même version de PostgreSQL.
- **restic plus récent (binaire de GitHub)** : il offre `--stdin-from-command`, mais il échappe aux mises à jour de
  sécurité automatiques d'Ubuntu. La suppression de la sauvegarde tronquée donne le même résultat.
- **Archivage continu (WAL, PITR)** : perte de quelques minutes seulement, mais un outil de plus (pgBackRest) et plus
  de stockage. À reconsidérer si le client demande mieux qu'une journée.
