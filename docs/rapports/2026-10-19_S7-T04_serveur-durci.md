# Rapport — S7-T04 : serveur durci, pile complète

|                                                 |                                      |
| ----------------------------------------------- | ------------------------------------ |
| **Date**                                        | 2026-10-19                           |
| **Sprint / tâches**                             | S7 — S7-T04                          |
| **Version**                                     | v0.7.0 → (v0.8.0 à la clôture du S7) |
| **Sections du cahier d'architecture modifiées** | §8 — version 4.10                    |

## 1. Résumé

Les scripts serveur du S1 ne déployaient que le site : ni API, ni base, ni secrets, ni migrations. Un serveur loué
n'aurait donc pas pu faire tourner Kemdia. Le serveur sait maintenant monter, pour chaque environnement
(préproduction et production), le site, l'API et une base PostgreSQL 18, chacun dans son conteneur durci. Les secrets
sont tirés au hasard sur le serveur et ne passent jamais par Git ni GitHub. Un nouveau job de la CI monte toute la
pile avec les vrais scripts et la vérifie. Aucun serveur n'a été loué (choix du découpage du S7).

## 2. Fonctionnalités livrées

| Élément                   | Description                                                                                                                                                                                                                                | Fichiers                                                 |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Pile par environnement    | `db` (PostgreSQL 18, SCRAM-SHA-256, lecture seule hors données), `api`, `web`, `migrate` (profil) ; réseaux `edge` (Caddy ↔ site, un par environnement), `app` (site ↔ API), `private` (API ↔ base, **sans Internet**) ; aucun port publié | `deploy/app/compose.yml`, `deploy/proxy/compose.yml`     |
| Secrets sur le serveur    | `init-secrets.sh <env> <domaine>` : mot de passe de base, clé interne, clés TOTP et KYC tirés avec `openssl rand` ; trois fichiers 0640 root:deploy ; le site ne reçoit que la clé interne et son adresse ; ne remplace jamais rien        | `deploy/bin/init-secrets.sh`                             |
| Déploiement à deux images | `deploy.sh <env> <site@sha256> <api@sha256> <version>` : dépôt d'images lu dans `/opt/kemdia/deploy.conf` (root), digests seulement, migrations **avant** la bascule, dernière version saine gardée, retour arrière, ménage prudent        | `deploy/bin/deploy.sh`                                   |
| Durcissement              | Noyau (`sysctl` : rp_filter, pas de redirections, syncookies, kptr/dmesg restreints), SSH (délais, pas de transfert d'agent), redémarrage automatique à 03:30 après correctifs, `openssl` installé                                         | `deploy/bin/setup-server.sh`                             |
| CI                        | Job « Pile serveur » : registre local, images construites, vrais scripts, Caddy en HTTPS, puis contrôles (voir §5) ; déploiement de préproduction et de production avec l'image de l'API                                                   | `.github/workflows/ci.yml`, `_deploy.yml`, `release.yml` |
| Mises à jour              | Dependabot suit les images épinglées de PostgreSQL et Caddy (écosystème `docker-compose`), sans version majeure de PostgreSQL automatique                                                                                                  | `.github/dependabot.yml`                                 |
| Guide                     | Étapes de mise en service, secrets, e-mails Brevo, journaux de l'API, accès à la base, retour arrière                                                                                                                                      | `docs/guides/deploiement.md`                             |

## 3. Décisions techniques

- [ADR-0043](../architecture/adr/0043-serveur-pile-complete.md) : PostgreSQL dans Docker sur le VPS, un par
  environnement ; secrets dans un fichier sur le serveur ; job CI qui monte toute la pile.
- Choix du 2026-10-19 : les quatre options recommandées.

## 4. Sécurité

Relecture indépendante (agent séparé, avant la PR) : **0 grave, 2 moyennes, plusieurs faibles**. Toutes ont été
traitées.

| Constat                                                                                          | Correction                                                                                       |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Moyen : le ménage pouvait supprimer l'image de la version précédente (retour arrière impossible) | On garde toute image citée par un état (en ligne, saine, précédente, des deux environnements)    |
| Moyen : `--fichiers-seulement` sur un vrai serveur rendrait l'état à root                        | Refusé hors GitHub Actions ou si le compte `deploy` existe                                       |
| Faible : réseau `edge` partagé entre préproduction et production                                 | Un réseau `kemdia-edge-<env>` par environnement ; Caddy rejoint les deux                         |
| Faible : état écrit avant les migrations, version précédente faussée par un redéploiement        | Fichier « dernière version saine » ; la version précédente n'est remplacée que si elle diffère   |
| Faible : erreur de démarrage de la base masquée avant les migrations                             | `migrate` s'arrête si la base ne démarre pas ; image PostgreSQL téléchargée seulement si absente |
| Faible : `$` dans un secret ajouté à la main                                                     | Commentaire dans le fichier : écrire `$$`                                                        |
| Faible : images PostgreSQL et Caddy non épinglées                                                | Épinglées par digest, suivies par Dependabot                                                     |
| Faible : écriture des trois secrets non atomique                                                 | Fichiers temporaires puis mise en place sans écrasement (`mv -n`)                                |
| Faible : `DAC_OVERRIDE` sur la base                                                              | Gardé (nécessaire à l'entrée de PostgreSQL), justifié en commentaire                             |
| Faible : compte `deploy` dans le groupe docker                                                   | Accepté : clé SSH limitée à `deploy.sh`, arguments validés strictement                           |

Risques restants : le compte `deploy` reste puissant s'il était compromis hors de la clé restreinte ; pas encore de
sauvegarde de la base (S7-T05) ni de surveillance (S7-T06).

## 5. Qualité

- Job CI « Pile serveur » vert : santé et version via `https://localhost`, en-têtes de sécurité, page d'accueil,
  base « ok » vue par l'API, aucun port 5432/4000/3000 ouvert, le site ne résout pas la base, la base n'a pas
  Internet ; second déploiement, retour arrière vers la version 1 ; refus d'un dépôt étranger, d'un tag sans digest et
  d'une version piégée (`ci;reboot`) ; secrets non remplacés au second passage, droits 640 root, aucun secret de l'API
  dans le fichier du site.
- ShellCheck (niveau style) sur les trois scripts ; format, lint, types, build, tests, Gitleaks 8.30.1 et Semgrep
  1.179.0 avant la PR (voir la PR).
- Aucune migration de l'application dans cette tâche ; aucun réglage Render ni fichier `.env` modifié.

## 6. Captures d'écran

Sans objet (aucun écran).

## 7. Limites connues / dette technique

- Pas de serveur loué : la pile n'a tourné que dans la CI.
- Pile non lancée sur la machine de développement (Docker Hub inaccessible dans l'environnement de travail).
- Une version majeure de PostgreSQL demandera une procédure manuelle (`pg_upgrade` ou export / import).

## 8. Prochaines étapes

- Le jour où un serveur est loué : `setup-server.sh`, `init-secrets.sh` pour la production et la préproduction,
  `/opt/kemdia/proxy/.env`, secrets GitHub (`DEPLOY_SSH_*`), voir le guide de déploiement.
- S7-T05 : sauvegardes chiffrées de PostgreSQL et restauration testée dans la CI.
