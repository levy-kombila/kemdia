# Planning de développement — Kemdia

> Document vivant. Mis à jour à la fin de chaque sprint (voir `docs/rapports/`).
> Sprint = 2 semaines indicatives. Chaque tâche a un identifiant `Sx-Tyy` repris dans les commits, PR et rapports.

**Périmètre de la phase 1 (MVP)** : marketplace hybride au **Gabon** — stock Kemdia + 50 vendeurs partenaires, ~500 produits,
Mobile Money (Moov, Airtel) et paiement à la livraison, lancement visé **fin 2027**
(détails : [cahier §1.2](architecture/cahier-architecture.md#12-mvp--lancement-visé-fin-2027), [règles métier](architecture/regles-metier.md)).

## Vue d'ensemble

| Sprint    | Objectif                                                                                                | Statut      |
| --------- | ------------------------------------------------------------------------------------------------------- | ----------- |
| **S0**    | Décision de réécriture, choix de la stack, poste de travail                                             | ✅ Terminé  |
| **S1**    | Fondations frontend + DevOps (CI/CD, sécurité, démo publique)                                           | ✅ Terminé  |
| **S2**    | Intégration du KSAD + finitions frontend (comptes, tunnel de commande, filtres, tests E2E)              | ✅ Terminé  |
| **S3**    | Backend NestJS + PostgreSQL, module `catalog`, site branché sur l'API                                   | 🚧 En cours |
| **S4**    | Module `identity` : comptes par e-mail ou téléphone (OTP), sécurité de connexion                        | ⏳          |
| **S5**    | Modules `orders` + `payments` : commande, Mobile Money, paiement à la livraison                         | ⏳          |
| **S6**    | Module `vendors` + back-office : boutiques, KYC, modération, commissions                                | ⏳          |
| **S7**    | Module `shipping` (transporteur) + préproduction (serveur, surveillance, sauvegardes, test d'intrusion) | ⏳          |
| **S8**    | Bêta fermée (vendeurs partenaires + testeurs) puis lancement Gabon 🇬🇦                                   | ⏳          |
| Après MVP | Affiliation, application mobile, suivi GPS, Kemdia Pay v2                                               | —           |

### Jalons

| Jalon  | Contenu                                                                                              | Visé                       |
| ------ | ---------------------------------------------------------------------------------------------------- | -------------------------- |
| v0.1.0 | Site vitrine + CI/CD + démo publique                                                                 | ✅ S1                      |
| v0.2.0 | Parcours client complet en démonstration : compte, commande, favoris, partage, tests de bout en bout | ✅ S2                      |
| v0.3.0 | Catalogue servi par l'API et PostgreSQL                                                              | fin S3                     |
| v0.5.0 | Premier achat de bout en bout en environnement de test (Mobile Money _sandbox_)                      | fin S5                     |
| v0.7.0 | Vendeurs partenaires opérationnels                                                                   | fin S6                     |
| v1.0.0 | Lancement public                                                                                     | S8 (fin 2027 au plus tard) |

### Actions hors code (équipe Kemdia) — à lancer tôt

Ces démarches prennent souvent plusieurs mois et **bloquent** des sprints si elles arrivent tard.

| Action                                                                                                               | Bloque   | Priorité      |
| -------------------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| Changer les secrets de l'ancien projet Django, archiver l'ancien dépôt                                               | Sécurité | 🔴 immédiat   |
| Compte marchand + accès API **Airtel Money** et **Moov Money** (ou agrégateur)                                       | S5       | 🔴 maintenant |
| Fournisseur SMS pour les codes OTP                                                                                   | S4       | 🟠 avant S4   |
| Partenariat transporteur (COMAT ou autre) : tarifs, échange de données                                               | S7       | 🟠            |
| Recrutement des 50 vendeurs partenaires, conditions de commission                                                    | S6 · S8  | 🟠            |
| Nom de domaine, entité juridique (RCCM, NIF), CGV, mentions légales, déclaration APDPVP                              | S7       | 🟠            |
| Vrai catalogue : fiches et **photos HD**                                                                             | S2 · S8  | 🟡            |
| Réponses aux [questions ouvertes](architecture/regles-metier.md#questions-ouvertes) (COD, coupons, commissions, TVA) | S5 · S6  | 🟡            |

---

## S0 — Cadrage ✅

| ID     | Tâche                                                                    | Statut |
| ------ | ------------------------------------------------------------------------ | ------ |
| S0-T01 | Analyse de l'ancien projet Django et des 4 rapports d'audit (45 failles) | ✅     |
| S0-T02 | Décision : réécriture complète (ADR-0001)                                | ✅     |
| S0-T03 | Choix de la stack TypeScript / Next.js (ADR-0002)                        | ✅     |
| S0-T04 | Guide d'installation du poste Windows                                    | ✅     |

## S1 — Fondations frontend + DevOps ✅

| ID     | Tâche                                                                                                          | Statut                   |
| ------ | -------------------------------------------------------------------------------------------------------------- | ------------------------ |
| S1-T01 | Monorepo pnpm + Turborepo, Prettier, EditorConfig (ADR-0003)                                                   | ✅                       |
| S1-T02 | Application Next.js 16 + Tailwind 4, charte Kemdia (design tokens)                                             | ✅                       |
| S1-T03 | Migration des données de démo (112 catégories, 50 produits, images WebP) — sans données personnelles           | ✅                       |
| S1-T04 | En-tête : barre d'infos, recherche, ville de livraison, compte, mini-panier                                    | ✅                       |
| S1-T05 | Méga-menu catégories (desktop) + tiroir (mobile)                                                               | ✅                       |
| S1-T06 | Page d'accueil (transcription de la maquette : hero, ventes flash, nouveautés, promos, catégories, carrousels) | ✅                       |
| S1-T07 | Pages catégorie, recherche, promotions, toutes les catégories (tri + pagination validés)                       | ✅                       |
| S1-T08 | Fiche produit (galerie, quantité, estimation livraison, données structurées SEO)                               | ✅                       |
| S1-T09 | Panier côté navigateur (ADR-0004) + choix de ville Gabon                                                       | ✅                       |
| S1-T10 | Pages d'information, 404, erreur, sitemap, robots                                                              | ✅                       |
| S1-T11 | En-têtes de sécurité (CSP, HSTS, X-Frame-Options…)                                                             | ✅                       |
| S1-T12 | Tests unitaires et composants (Vitest) — 37 tests                                                              | ✅                       |
| S1-T13 | CI GitHub Actions : format, lint, types, tests, build, image Docker + Trivy                                    | ✅                       |
| S1-T14 | Sécurité continue : Gitleaks, pnpm audit, CodeQL, Dependabot, revue des dépendances                            | ✅                       |
| S1-T15 | Dockerfile multi-étapes non-root + docker-compose                                                              | ✅                       |
| S1-T16 | Rapport Sprint 1 + Cahier d'architecture v0.1                                                                  | ✅                       |
| S1-T17 | Pipeline CD : GHCR, staging automatique, release → production, retour arrière (ADR-0005)                       | ✅                       |
| S1-T18 | Scripts serveur durcis (setup, deploy restreint), Caddy HTTPS                                                  | ✅                       |
| S1-T19 | Actions épinglées par SHA, Semgrep + ShellCheck, compatibilité dépôt privé                                     | ✅                       |
| S1-T20 | Mise en ligne v0.1.0 (serveur, domaine, secrets GitHub)                                                        | ⏳ en attente du serveur |
| S1-T21 | Démo publique gratuite (Render) déployée automatiquement par le pipeline                                       | ✅                       |
| S1-T22 | Publication de l'image sur Docker Hub (`levy2025/kemdia`) en plus de GHCR                                      | ✅                       |

## S2 — Intégration du KSAD + finitions frontend ✅

| ID     | Tâche                                                                                                                  | Statut |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| S2-T00 | Intégrer le KSAD : synthèse, règles métier numérotées, ADR-0006 (7 modules), concepts expliqués, cahier v0.4, planning | ✅     |
| S2-T01 | Pages connexion / inscription par **e-mail ou téléphone**, écran de code OTP, mot de passe oublié (interface)          | ✅     |
| S2-T02 | Tunnel de commande (maquette) : adresse → livraison → paiement Moov / Airtel / à la livraison → confirmation           | ✅     |
| S2-T03 | Filtres catégorie et recherche : prix, marque, disponibilité (FR-005)                                                  | ✅     |
| S2-T04 | Favoris (liste de souhaits) dans le navigateur (FR-014)                                                                | ✅     |
| S2-T05 | Partage **WhatsApp** + aperçus OpenGraph soignés par produit                                                           | ✅     |
| S2-T06 | Page « Devenir vendeur » (présentation de l'offre marketplace)                                                         | ✅     |
| S2-T07 | Tests de bout en bout Playwright dans la CI (parcours d'achat sur mobile)                                              | ✅     |
| S2-T08 | Budget de performance : pages clés mesurées en 3G sur téléphone à chaque PR (premier affichage < 2 s)                  | ✅     |
| S2-T09 | Fermeture de la dette S1 : PR Dependabot obsolètes, configuration Dependabot, mises à jour sûres                       | ✅     |
| S2-T10 | Refonte visuelle « place de marché » : accueil, fiche produit, barre mobile, connexion, listes, panier                 | ✅     |

## S3 — Backend : socle et module `catalog` 🚧

| ID     | Tâche                                                                                                                                | Statut |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| S3-T01 | `apps/api` NestJS, architecture hexagonale, configuration validée au démarrage                                                       | ✅     |
| S3-T02 | PostgreSQL en local via `docker compose` (parité avec la production), Prisma, un schéma par module                                   | ✅     |
| S3-T03 | Module `catalog` : catégories, produits, **variantes**, stock, UUID (BR-001, BR-042, FR-013)                                         | ✅     |
| S3-T04 | API REST `/api/v1` documentée (OpenAPI), limitation de débit                                                                         | ✅     |
| S3-T05 | Le site lit l'API au lieu du fichier de démonstration (`lib/catalog.ts`)                                                             | ✅     |
| S3-T06 | CI : tests d'intégration avec une base PostgreSQL éphémère, image Docker de l'API                                                    | ✅     |
| S3-T07 | Démo Render : API + base de données gratuite (Neon), migrations et import au démarrage (ADR-0013)                                    | ✅     |
| S3-T08 | Dette : accueil allégé (blocage visé 300 ms), TypeScript 6.0 et ESLint 10 (API, contrat) — ADR-0014, retrait du mode fichier du site | ✅     |

## S4 à S8 — grandes lignes

- **S4 `identity` + `notifications`** : e-mail ou téléphone + OTP (BR-041), Argon2id, cookies sécurisés, blocage après 3 échecs (BR-040), RBAC, journal d'audit.
- **S5 `orders` + `payments`** : panier serveur (et vérification du panier par `POST /availability` au passage en caisse), réservation de stock atomique (BR-012), coupons (BR-030), paiement à la livraison sous conditions (BR-011),
  adaptateurs Moov / Airtel en _sandbox_, webhooks signés, idempotence, factures (FR-015).
- **S6 `vendors` + back-office** : boutique, KYC (BR-024), modération des produits (BR-003), commandes vendeur (BR-013), commissions (BR-020), modération des avis.
- **S7 `shipping` + préproduction** : transporteur, commission logistique (BR-021), serveur durci, surveillance, sauvegardes chiffrées testées, test d'intrusion, conformité.
- **S8** : bêta fermée avec les vendeurs partenaires, corrections, lancement.
