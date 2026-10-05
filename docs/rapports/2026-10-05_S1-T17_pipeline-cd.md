# Rapport — Pipeline de livraison continue (CD) et préparation de la mise en ligne

|                                                 |                                                            |
| ----------------------------------------------- | ---------------------------------------------------------- |
| **Date**                                        | 2026-10-05                                                 |
| **Sprint / tâches**                             | S1 — S1-T17, S1-T18, S1-T19 (S1-T20 en attente du serveur) |
| **Version**                                     | v0.1.0 (à étiqueter après validation en staging)           |
| **Sections du cahier d'architecture modifiées** | §7 DevOps — CI/CD, §8 Déploiement (v0.2)                   |

## 1. Résumé

Le dépôt GitHub `levy-kombila/kemdia` est créé et l'image Docker validée en local (`docker compose up`).
Ce lot ajoute la **livraison continue** : après chaque fusion dans `main`, l'image testée est publiée et déployée
automatiquement en **staging** ; un **tag de version** promeut cette même image en **production**, avec test de fumée
et retour arrière automatique. Les scripts de préparation du serveur appliquent un durcissement standard.

## 2. Fonctionnalités livrées

| Tâche  | Description                                                                                                                                    | Fichiers                                                                            |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| S1-T17 | CI/CD : publication GHCR par commit, staging automatique, release par tag, Release GitHub avec notes, rollback manuel par relance              | `.github/workflows/ci.yml`, `release.yml`, `_deploy.yml`                            |
| S1-T17 | Point de santé `/api/health` (version + environnement), utilisé par Docker et par les tests de fumée                                           | `apps/web/src/app/api/health/route.ts`                                              |
| S1-T18 | Préparation serveur en une commande : Docker, UFW, Fail2ban, SSH par clé sans root, MAJ de sécurité auto, utilisateur `deploy` restreint       | `deploy/bin/setup-server.sh`                                                        |
| S1-T18 | Déploiement par digest avec validation stricte, verrou, retour arrière automatique ou à la demande                                             | `deploy/bin/deploy.sh`                                                              |
| S1-T18 | Caddy : HTTPS automatique, HTTP/3, redirection www, staging protégé et non indexé                                                              | `deploy/proxy/*`                                                                    |
| S1-T18 | Conteneur durci : lecture seule, `cap_drop: ALL`, mémoire/processus bornés, aucun port publié                                                  | `deploy/app/compose.yml`                                                            |
| S1-T19 | Toutes les actions GitHub épinglées par SHA ; Semgrep (SAST) et ShellCheck ajoutés ; CodeQL et revue de dépendances limités aux dépôts publics | `.github/workflows/security.yml`                                                    |
| —      | Image : correctifs OS (`apk upgrade`), suppression de npm/corepack, URL canonique en argument de build                                         | `apps/web/Dockerfile`                                                               |
| —      | Guide pas à pas, ADR-0005                                                                                                                      | `docs/guides/deploiement.md`, `docs/architecture/adr/0005-strategie-deploiement.md` |

## 3. Décisions techniques

[ADR-0005](../architecture/adr/0005-strategie-deploiement.md) : VPS + Docker Compose + Caddy ; _build once, deploy many_ ;
staging automatique, production par tag ; clé SSH à commande forcée.

## 4. Sécurité

| Risque                                                          | Mesure                                                                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Détournement d'une action GitHub (tag modifié par un attaquant) | Actions épinglées par SHA de commit, mises à jour par Dependabot                                                                                                        |
| Fuite de la clé de déploiement                                  | Clé utilisable uniquement pour lancer `deploy.sh` (pas de shell, pas de tunnel), arguments validés par expressions régulières (testé contre des tentatives d'injection) |
| Interception de la connexion CI → serveur                       | Empreinte du serveur épinglée (`StrictHostKeyChecking=yes`)                                                                                                             |
| Jeton du registre exposé                                        | Jeton éphémère `GITHUB_TOKEN`, lecture seule, transmis par l'entrée standard, configuration Docker temporaire supprimée                                                 |
| Image modifiée entre staging et production                      | Déploiement par digest SHA-256 ; la release ré-étiquette l'image existante sans la reconstruire                                                                         |
| Image vulnérable                                                | Scan Trivy bloquant avant publication ; npm retiré de l'image                                                                                                           |
| Préproduction exposée / indexée                                 | Mot de passe + `X-Robots-Tag: noindex`                                                                                                                                  |
| Serveur                                                         | SSH par clé, root interdit, pare-feu 22/80/443, Fail2ban, mises à jour automatiques                                                                                     |

## 5. Qualité

| Vérification                                                                                                                               | Résultat                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| actionlint (syntaxe + ShellCheck des scripts des workflows)                                                                                | ✅ 0 erreur                                                                                  |
| ShellCheck `deploy/bin/*.sh`                                                                                                               | ✅ 0 avertissement                                                                           |
| `deploy.sh` simulé (faux Docker) : déploiement, 2ᵉ déploiement, rollback demandé, échec de santé → rollback auto, 5 tentatives d'injection | ✅ comportements attendus                                                                    |
| `/api/health` sur le serveur standalone                                                                                                    | ✅ `{"status":"ok","version":"sha-test","environment":"staging"}`, `Cache-Control: no-store` |
| Lint, types, 37 tests, build                                                                                                               | ✅                                                                                           |

## 6. Limites connues

- **Non vérifié en conditions réelles** : la CI GitHub (pas d'accès au dépôt privé depuis cette session),
  la construction de l'image modifiée (pas de Docker ici), et le déploiement sur un vrai serveur (pas encore de VPS).
- Les règles Semgrep n'ont pas pu être exécutées localement (registre de règles inaccessible) : à surveiller au premier passage.
- Plan GitHub gratuit : pas de protection de `main` ni d'approbation de production (voir guide §11).
- Coupure de quelques secondes à chaque déploiement (pas encore de _blue/green_).

## 7. Prochaines étapes

1. Appliquer ce lot via une PR (`feature/S1-T17-pipeline-cd`) et vérifier que tous les contrôles sont verts.
2. Louer le VPS, configurer le domaine, suivre `docs/guides/deploiement.md` §3 à §7 → staging en ligne.
3. Valider le staging, puis `git tag v0.1.0` → production (S1-T20).
