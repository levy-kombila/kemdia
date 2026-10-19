# Rapport — S7-T05 : sauvegardes chiffrées et restauration testée

|                                                 |                                      |
| ----------------------------------------------- | ------------------------------------ |
| **Date**                                        | 2026-10-19                           |
| **Sprint / tâches**                             | S7 — S7-T05                          |
| **Version**                                     | v0.7.0 → (v0.8.0 à la clôture du S7) |
| **Sections du cahier d'architecture modifiées** | §8 — version 4.11                    |

## 1. Résumé

Chaque nuit, le serveur sauvegarde la base de chaque environnement ainsi que les secrets et la configuration de
Caddy. Les sauvegardes sont chiffrées par restic, gardées sur le serveur et copiées vers un stockage S3 dès qu'il est
configuré. Chaque dimanche, la dernière sauvegarde est restaurée dans une base temporaire pour vérifier qu'elle
fonctionne. La CI rejoue la perte complète du serveur : la base et le dépôt local sont effacés, puis tout est
restauré depuis S3. Le contenu revient identique, table par table.

## 2. Fonctionnalités livrées

| Élément               | Description                                                                                                                                                                       | Fichiers                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Sauvegarde            | `pg_dump` dans le conteneur PostgreSQL envoyé directement à restic (rien en clair sur le disque), secrets et Caddy, rétention 7/4/6, `restic check`, copie S3, état `backup.last` | `deploy/bin/backup.sh`, `deploy/bin/backup-lib.sh` |
| Restauration          | `liste`, `fichiers` (secrets dans un dossier vide), `verifier` (base temporaire), `remplacer` (restauration à côté puis bascule, ancienne base gardée) ; `--s3`                   | `deploy/bin/restore.sh`                            |
| Minuteurs             | Sauvegarde chaque nuit à 02:00, vérification de restauration le dimanche à 05:00 ; confinés par systemd                                                                           | `deploy/systemd/`, `deploy/bin/setup-server.sh`    |
| Test de sinistre (CI) | Base remplie, sauvegarde par systemd, chiffrement vérifié, perte du serveur, restauration depuis S3, contenu comparé, site et API en ligne                                        | `.github/workflows/ci.yml` (job « Pile serveur »)  |
| Guide                 | Mise en place, S3 (Cloudflare R2), restauration, procédure « serveur perdu »                                                                                                      | `docs/guides/deploiement.md` §11                   |

## 3. Décisions techniques

- [ADR-0044](../architecture/adr/0044-sauvegardes-restic.md) : restic, sur le serveur et sur S3, chaque nuit, rétention
  7 jours / 4 semaines / 6 mois, test CI de restauration complète (les quatre options recommandées, choix du
  2026-10-19).
- restic vient du paquet Ubuntu (0.16.4), pour profiter des mises à jour de sécurité automatiques. Il n'a pas
  `--stdin-from-command` (essayé en local : refusé). Une sauvegarde tronquée par un échec de `pg_dump` est donc
  supprimée aussitôt (testé en local).

## 4. Sécurité

Relecture indépendante (agent séparé, avant la PR) : **3 graves, 4 moyennes, 4 faibles**.

| Constat                                                                                                                       | Correction                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Grave : un identifiant de sauvegarde fait ignorer le filtre de restic ; la base de production aurait pu être vidée            | L'identifiant est cherché dans la liste des sauvegardes de **cette** base ; contenu vérifié avant tout arrêt ; testé en local et en CI |
| Grave : la base en service était supprimée avant de savoir si la restauration marchait                                        | Restauration **à côté**, puis bascule par renommage ; ancienne base gardée et remise en service si l'API ne démarre pas                |
| Grave : root sur le serveur peut aussi effacer la copie S3                                                                    | **Risque restant**, documenté (ADR, guide) : copie mensuelle hors ligne en attendant une parade décidée avec le client                 |
| Moyen : dernière ligne du fichier S3 ignorée sans retour à la ligne (S3 désactivé en silence)                                 | Lecture robuste (dernière ligne, CRLF, guillemets) ; fichier présent sans adresse = erreur ; testé en local et en CI                   |
| Moyen : état « ok » ancien laissé en cas d'arrêt avant la fin                                                                 | État « échec » écrit à la sortie si le travail n'est pas allé au bout                                                                  |
| Moyen : sauvegarde possible pendant une restauration                                                                          | Verrou commun sauvegarde / vérification / restauration, plus le verrou de `deploy.sh`                                                  |
| Moyen : copie S3 jamais vérifiée                                                                                              | Relecture de 5 % du dépôt S3 chaque semaine                                                                                            |
| Faibles : sauvegarde tronquée non supprimée en silence, fichiers temporaires sauvegardés, minuteurs peu confinés, chemin `..` | Échec signalé ; exclusions élargies ; `ProtectSystem=strict`, 4 h au plus ; chemin résolu                                              |

Le mot de passe des sauvegardes (0600 root) n'est lisible ni par le compte `deploy` ni par la CI. Il n'est pas dans
les sauvegardes, et aucun secret n'apparaît dans les journaux ni dans les arguments des commandes.

## 5. Qualité

- Job CI « Pile serveur », étape « Sauvegardes » :
  - catalogue de démonstration importé ;
  - sauvegarde lancée par systemd (`resultat=ok`, `s3=oui`) ;
  - aucune donnée en clair dans le dépôt, mauvais mot de passe refusé ;
  - secrets récupérables, sans le mot de passe des sauvegardes ni l'accès S3 ;
  - vérification hebdomadaire réussie ;
  - remplacement par la sauvegarde des secrets refusé ;
  - perte du serveur, puis restauration depuis S3 : contenu identique, site et API en ligne.
- Essais locaux (restic 0.16.4, S3 moto) :
  - sauvegarde tronquée supprimée ;
  - choix de la sauvegarde (dernière, préfixe, autre environnement refusé) ;
  - lecture du fichier S3 (sans retour final, CRLF, guillemets, adresse absente) ;
  - état « échec » en cas d'arrêt ;
  - refus des chemins hors règles.
- ShellCheck (niveau style), format, Gitleaks 8.30.1, Semgrep 1.179.0 : voir la PR.
- Aucun code TypeScript ni migration de base modifiés ; aucun réglage Render ni fichier `.env` touché.

## 6. Captures d'écran

Sans objet (aucun écran).

## 7. Limites connues / dette technique

- **Copie S3 effaçable par un attaquant devenu root** sur le serveur (voir §4) : parade à décider avec le client.
- Perte maximale d'une journée de données. L'archivage continu (PITR) est écarté pour l'instant.
- La démo Render (base Neon) n'est pas concernée : ce sont des données de démonstration.
- Pas encore d'alerte quand une sauvegarde échoue : la surveillance (S7-T06) lira `backup.last` et
  `restore-check.last`.
- Le redémarrage automatique de 03:30 peut couper une très longue première copie S3. restic la reprend la nuit
  suivante.

## 8. Prochaines étapes

- Le jour de la location : `backup.sh init`, mot de passe dans le gestionnaire, bucket R2 et `backup-s3.env` (guide
  §11).
- S7-T06 : surveillance et alertes (santé de l'API et de la base, état des sauvegardes).
