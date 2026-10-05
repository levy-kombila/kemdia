# Planning de développement — Kemdia

> Document vivant. Mis à jour à la fin de chaque sprint (voir `docs/rapports/`).
> Sprint = 2 semaines indicatives. Chaque tâche a un identifiant `Sx-Tyy` repris dans les commits, PR et rapports.

**Périmètre de la phase 1** : vente en ligne au **Gabon uniquement** (FCFA, Mobile Money, livraison par ville/quartier).

## Vue d'ensemble

| Sprint | Objectif                                                                                           | Statut     |
| ------ | -------------------------------------------------------------------------------------------------- | ---------- |
| **S0** | Décision de réécriture, choix de la stack, poste de travail                                        | ✅ Terminé |
| **S1** | Fondations frontend + DevOps (CI/CD, sécurité)                                                     | ✅ Terminé |
| **S2** | Finitions frontend : comptes (maquettes), favoris, avis, tunnel de commande (maquettes), tests E2E | ⏳ À venir |
| **S3** | Backend API : catalogue, PostgreSQL, Prisma, branchement du frontend                               | ⏳         |
| **S4** | Comptes clients : inscription, connexion, vérification e-mail, sessions sécurisées                 | ⏳         |
| **S5** | Commande & paiement : panier serveur, Airtel Money / Moov Money, paiement à la livraison           | ⏳         |
| **S6** | Back-office : produits, stocks, commandes, livraisons, rôles                                       | ⏳         |
| **S7** | Pré-production : hébergement, monitoring, sauvegardes, test d'intrusion, conformité                | ⏳         |
| **S8** | Mise en production Gabon 🇬🇦                                                                        | ⏳         |

---

## S0 — Cadrage ✅

| ID     | Tâche                                                                    | Statut |
| ------ | ------------------------------------------------------------------------ | ------ |
| S0-T01 | Analyse de l'ancien projet Django et des 4 rapports d'audit (45 failles) | ✅     |
| S0-T02 | Décision : réécriture complète (ADR-0001)                                | ✅     |
| S0-T03 | Choix de la stack TypeScript / Next.js (ADR-0002)                        | ✅     |
| S0-T04 | Guide d'installation du poste Windows                                    | ✅     |

## S1 — Fondations frontend + DevOps ✅

| ID     | Tâche                                                                                                          | Statut |
| ------ | -------------------------------------------------------------------------------------------------------------- | ------ |
| S1-T01 | Monorepo pnpm + Turborepo, Prettier, EditorConfig (ADR-0003)                                                   | ✅     |
| S1-T02 | Application Next.js 16 + Tailwind 4, charte Kemdia (design tokens)                                             | ✅     |
| S1-T03 | Migration des données de démo (112 catégories, 50 produits, images WebP) — sans données personnelles           | ✅     |
| S1-T04 | En-tête : barre d'infos, recherche, ville de livraison, compte, mini-panier                                    | ✅     |
| S1-T05 | Méga-menu catégories (desktop) + tiroir (mobile)                                                               | ✅     |
| S1-T06 | Page d'accueil (transcription de la maquette : hero, ventes flash, nouveautés, promos, catégories, carrousels) | ✅     |
| S1-T07 | Pages catégorie, recherche, promotions, toutes les catégories (tri + pagination validés)                       | ✅     |
| S1-T08 | Fiche produit (galerie, quantité, estimation livraison, données structurées SEO)                               | ✅     |
| S1-T09 | Panier côté navigateur (ADR-0004) + choix de ville Gabon                                                       | ✅     |
| S1-T10 | Pages d'information, 404, erreur, sitemap, robots                                                              | ✅     |
| S1-T11 | En-têtes de sécurité (CSP, HSTS, X-Frame-Options…)                                                             | ✅     |
| S1-T12 | Tests unitaires et composants (Vitest) — 37 tests                                                              | ✅     |
| S1-T13 | CI GitHub Actions : format, lint, types, tests, build, image Docker + Trivy                                    | ✅     |
| S1-T14 | Sécurité continue : Gitleaks, pnpm audit, CodeQL, Dependabot, revue des dépendances                            | ✅     |
| S1-T15 | Dockerfile multi-étapes non-root + docker-compose                                                              | ✅     |
| S1-T16 | Rapport Sprint 1 + Cahier d'architecture v0.1                                                                  | ✅     |

## S2 — Finitions frontend (proposition)

| ID     | Tâche                                                                                       |
| ------ | ------------------------------------------------------------------------------------------- |
| S2-T01 | Photos produits HD (les images actuelles font 225 px) + bannières dédiées Kemdia            |
| S2-T02 | Pages connexion / inscription / mot de passe oublié (interface seule)                       |
| S2-T03 | Liste d'envies (favoris)                                                                    |
| S2-T04 | Affichage des avis clients sur la fiche produit                                             |
| S2-T05 | Tunnel de commande en maquette : adresse → livraison → paiement Mobile Money → confirmation |
| S2-T06 | Filtres catégorie : prix, marque, disponibilité                                             |
| S2-T07 | Tests de bout en bout Playwright dans la CI (parcours d'achat, mobile)                      |
| S2-T08 | Audit d'accessibilité et de performance (Lighthouse CI, budget de poids des pages)          |
| S2-T09 | Déploiement automatique d'une préproduction à chaque PR (CD)                                |

## S3 à S8 — Backend et mise en production (grandes lignes)

- **S3 Backend** : NestJS + PostgreSQL + Prisma, API catalogue, documentation OpenAPI, tests d'intégration en CI avec base PostgreSQL éphémère.
- **S4 Comptes** : mots de passe Argon2id, cookies `HttpOnly`/`Secure`/`SameSite`, limitation de débit, verrouillage, vérification e-mail **obligatoire** avant connexion.
- **S5 Paiement** : montants recalculés côté serveur, idempotence, vérification des webhooks par signature, réconciliation ; un code promo = usage comptabilisé de façon atomique.
- **S6 Back-office** : RBAC strict, aucune action d'écriture en GET, journal d'audit.
- **S7 Pré-prod** : hébergement, sauvegardes chiffrées testées, monitoring/alertes, test d'intrusion externe, mentions légales et politique de confidentialité (loi n°001/2011).
- **S8 Production** : lancement Libreville puis montée en charge.
