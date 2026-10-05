# Rapport — Démo publique gratuite et vérification de la publication d'image

|                                                 |             |
| ----------------------------------------------- | ----------- |
| **Date**                                        | 2026-10-05  |
| **Sprint / tâches**                             | S1 — S1-T21 |
| **Sections du cahier d'architecture modifiées** | §8 (v0.3)   |

## 1. Résumé

La PR #7 a été fusionnée : sur `main`, toute la chaîne est verte et l'image Docker est **publiée sur GHCR**
(`ghcr.io/levy-kombila/kemdia/web:sha-1101cde…` et `:main`), scannée par Trivy sans vulnérabilité critique ou haute.
Le déploiement staging est correctement ignoré tant que le serveur n'existe pas.

Ce lot ajoute un environnement **démo publique gratuite** sur Render, alimenté automatiquement par le pipeline,
pour montrer le site à distance sans attendre le VPS.

## 2. Livré

| Élément                                                                                                              | Fichier                         |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| Job `deploy-demo` : deploy hook Render avec le digest de l'image, attente de la bonne version, contrôle des en-têtes | `.github/workflows/ci.yml`      |
| Version du commit inscrite dans l'image (`APP_VERSION`), visible sur `/api/health`                                   | `apps/web/Dockerfile`, `ci.yml` |
| Healthcheck Docker sur le port réellement utilisé (`$PORT`)                                                          | `apps/web/Dockerfile`           |
| Guide pas à pas (jeton lecture seule, service Render, secrets GitHub)                                                | `docs/guides/demo-gratuite.md`  |

## 3. Sécurité

Jeton GHCR en lecture seule à durée limitée stocké uniquement chez Render ; URL du deploy hook en secret GitHub ;
même image (scannée, non-root) que les autres environnements ; aucune donnée réelle sur la démo.

## 4. Limites

- Offre gratuite : mise en veille après 15 min sans visite, ~1 min au premier chargement.
- Le job de démo est ignoré tant que `RENDER_DEPLOY_HOOK_URL` n'est pas défini.
- Le déploiement Render réel n'a pas encore été testé (compte à créer par le propriétaire).
