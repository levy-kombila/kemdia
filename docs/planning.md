# Planning de développement — Kemdia

> Document vivant. Mis à jour à la fin de chaque sprint (voir `docs/rapports/`).
> Sprint = 2 semaines indicatives. Chaque tâche a un identifiant `Sx-Tyy` repris dans les commits, PR et rapports.

**Périmètre de la phase 1 (MVP)** : marketplace hybride au **Gabon** — stock Kemdia + 50 vendeurs partenaires, ~500 produits,
Mobile Money (Moov, Airtel) et paiement à la livraison, lancement visé **fin 2027**
(détails : [cahier §1.2](architecture/cahier-architecture.md#12-mvp--lancement-visé-fin-2027), [règles métier](architecture/regles-metier.md)).

## Vue d'ensemble

| Sprint    | Objectif                                                                                                | Statut     |
| --------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| **S0**    | Décision de réécriture, choix de la stack, poste de travail                                             | ✅ Terminé |
| **S1**    | Fondations frontend + DevOps (CI/CD, sécurité, démo publique)                                           | ✅ Terminé |
| **S2**    | Intégration du KSAD + finitions frontend (comptes, tunnel de commande, filtres, tests E2E)              | ✅ Terminé |
| **S3**    | Backend NestJS + PostgreSQL, module `catalog`, site branché sur l'API                                   | ✅ Terminé |
| **S4**    | Module `identity` : comptes par e-mail ou téléphone (OTP), sécurité de connexion                        | ✅ Terminé |
| **S5**    | Modules `orders` + `payments` : commande, Mobile Money, paiement à la livraison                         | ✅ Terminé |
| **S6**    | Module `vendors` + back-office : boutiques, KYC, modération, commissions                                | ✅ Terminé |
| **S7**    | Module `shipping` (transporteur) + préproduction (serveur, surveillance, sauvegardes, test d'intrusion) | ✅ Terminé |
| **S7.5**  | Sprint correctif : CI plus rapide, écrans d'administration reportés, remarques du propriétaire          | ✅ Terminé |
| **S8**    | Bêta fermée (vendeurs partenaires + testeurs) puis lancement Gabon 🇬🇦                                   | ⏳         |
| Après MVP | Affiliation, application mobile, suivi GPS, Kemdia Pay v2                                               | —          |

### Jalons

| Jalon  | Contenu                                                                                                                               | Visé                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| v0.1.0 | Site vitrine + CI/CD + démo publique                                                                                                  | ✅ S1                      |
| v0.2.0 | Parcours client complet en démonstration : compte, commande, favoris, partage, tests de bout en bout                                  | ✅ S2                      |
| v0.3.0 | Catalogue servi par l'API et PostgreSQL                                                                                               | ✅ S3                      |
| v0.4.0 | Comptes clients sécurisés : inscription par code, sessions, rôles, journal d'audit, CSRF/CSP/limites                                  | ✅ S4                      |
| v0.5.0 | Premier achat de bout en bout en environnement de test (Mobile Money _sandbox_)                                                       | ✅ S5                      |
| v0.7.0 | Vendeurs partenaires opérationnels                                                                                                    | ✅ S6                      |
| v0.8.0 | Préproduction prête : livraisons, serveur, sauvegardes, surveillance, test d'intrusion, APDPVP                                        | ✅ S7                      |
| v0.8.1 | Sprint correctif : CI rapide, fiche commune et offres, rôles d'équipe, Finance, recherche, boutiques, photo de profil                 | ✅ S7.5                    |
| v0.9.0 | Bêta fermée prête : avis, invitations, signalements, import du catalogue, accueil rapide, recherche des boutiques, compteurs partagés | ✅ S8                      |
| v1.0.0 | Lancement public                                                                                                                      | S9 (fin 2027 au plus tard) |

### Actions hors code (équipe Kemdia) — à lancer tôt

Ces démarches prennent souvent plusieurs mois et **bloquent** des sprints si elles arrivent tard.

| Action                                                                                                               | Bloque   | Priorité      |
| -------------------------------------------------------------------------------------------------------------------- | -------- | ------------- |
| Changer les secrets de l'ancien projet Django, archiver l'ancien dépôt                                               | Sécurité | 🔴 immédiat   |
| Compte marchand + accès API **Airtel Money** et **Moov Money** (ou agrégateur)                                       | S5       | 🔴 maintenant |
| Fournisseur SMS pour les codes OTP — **décision du client** (note remise le 2026-10-07) ; en attendant : e-mail seul | S4 · S8  | 🟠            |
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

## S3 — Backend : socle et module `catalog` ✅

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

## S4 — Module `identity` : comptes et connexion ✅

Décisions : [ADR-0015](architecture/adr/0015-identite-sessions-otp.md) (sessions en base + cookie, Argon2id, codes, SMS différé),
[ADR-0016](architecture/adr/0016-inscription-tickets-emails.md) (inscription sans énumération, tickets, e-mails),
[ADR-0017](architecture/adr/0017-connexion-sessions.md) (connexion, sessions, blocage neutre),
[ADR-0018](architecture/adr/0018-mot-de-passe-oublie.md) (mot de passe oublié),
[ADR-0019](architecture/adr/0019-site-branche-identite.md) (site branché : cookies, actions serveur),
[ADR-0020](architecture/adr/0020-roles-journal-audit.md) (rôles et journal d'audit),
[ADR-0021](architecture/adr/0021-csrf-csp-limites.md) (CSRF, CSP à nonce, limites),
[ADR-0022](architecture/adr/0022-reveil-demo-retrait-colonnes.md) (réveil de la démo, colonnes en deux temps).

| ID     | Tâche                                                                                                                                  | Statut |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S4-T01 | Fondations `identity` : schéma `identity`, comptes, Argon2id, codes à usage unique, port d'envoi, `SMS_ENABLED` (ADR-0015)             | ✅     |
| S4-T02 | Inscription + vérification par code (BR-041, HIGH-11) ; e-mails Mailpit (local) et Brevo (démo, actif depuis le 2026-10-08) — ADR-0016 | ✅     |
| S4-T03 | Connexion, sessions 30 jours glissants, déconnexion, blocage neutre après 3 échecs (BR-040) — ADR-0017                                 | ✅     |
| S4-T04 | Mot de passe oublié (FR-012) : ticket + code, aucun e-mail sans compte, connecté ici et déconnecté ailleurs — ADR-0018                 | ✅     |
| S4-T05 | Site branché sur l'API : cookies `HttpOnly`, « Bonjour, Awa », Mon compte, retour à la page d'avant ; téléphone « bientôt » — ADR-0019 | ✅     |
| S4-T06 | Rôles (RBAC) et journal d'audit : 4 rôles cumulables, `@Authorize`, admin par commande serveur, journal 365 j (CRIT-06) — ADR-0020     | ✅     |
| S4-T07 | CSRF (origine stricte), CSP à _nonce_, limites par visiteur et par compte, IP du visiteur au journal (HIGH-16, MED-05) — ADR-0021      | ✅     |
| S4-T08 | Démo : écran « La boutique se réveille » ; colonnes obsolètes ignorées (suppression au S5-T01) ; versions 0.4.0 ; clôture — ADR-0022   | ✅     |

## S5 — Modules `orders` + `payments` ✅

Décisions : [ADR-0023](architecture/adr/0023-panier-serveur.md) (panier serveur), [ADR-0024](architecture/adr/0024-commandes-reservation-stock.md) (commandes, réservation du stock), [ADR-0025](architecture/adr/0025-coupons.md) (coupons), [ADR-0029](architecture/adr/0029-site-tunnel-commande-mes-commandes.md) (site branché, « Mes commandes »), [ADR-0030](architecture/adr/0030-demo-premier-achat-ci-allegee.md) (démo du premier achat, CI allégée).
Choix du 2026-10-10 : **compte obligatoire pour commander** ; paniers **additionnés** à la connexion ; connecté, panier **sur le serveur seul** ;
paniers gardés **90 jours** ; numéro **KMD-7F3K9Q** ; **30 min** pour payer par Mobile Money ; annulation **avant l'expédition** ; prix changé → **nouveau total à confirmer** ; coupons : pourcentage ou montant fixe, articles seulement, un par commande, rendus à l'annulation ; paiement à la livraison, coupons et Mobile Money : **en attente du client** (voir les [questions ouvertes](architecture/regles-metier.md#questions-ouvertes)).

| ID     | Tâche                                                                                                                                                                    | Statut |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| S5-T01 | Colonnes `failed_logins` / `locked_until` supprimées (ADR-0022, étape 2) ; module `orders` : panier serveur vérifié, réunion à la connexion, site branché — ADR-0023     | ✅     |
| S5-T02 | Commande : adresse, frais de livraison calculés par l'API, réservation du stock dans la même transaction (BR-012), statuts, annulation (BR-010), idempotence — ADR-0024  | ✅     |
| S5-T03 | Coupons : expiration et limite comptées de façon atomique (BR-030), cumul réglable (BR-031) ; administration par l'API, journal d'audit — ADR-0025                       | ✅     |
| S5-T04 | Module `payments` : port fournisseur, essais Mobile Money (3 au plus), paiement à la livraison réglable (BR-011, FR-017), remboursements suivis à la main — ADR-0026     | ✅     |
| S5-T05 | Mobile Money en _sandbox_ : opérateur simulé et téléphone simulé, notifications signées (HMAC, 5 min), rejeu refusé — ADR-0027                                           | ✅     |
| S5-T06 | Factures (FR-015) : au paiement reçu, numéros par année sans trou, avoir à l'annulation, PDF, envoi par e-mail — ADR-0028                                                | ✅     |
| S5-T07 | Site branché : vrai tunnel de commande (compte obligatoire), devis et code promo, attente du paiement sur la page de la commande, « Mes commandes », factures — ADR-0029 | ✅     |
| S5-T08 | Démo du premier achat : page /demo et bandeau, code promo DEMO10 (démo seulement), CI allégée pour la documentation, versions 0.5.0, clôture — ADR-0030                  | ✅     |

## S6 — Module `vendors` + back-office ✅

Décisions : [ADR-0031](architecture/adr/0031-en-ligne-docker-tunnel.md) (en ligne depuis Docker Desktop), [ADR-0032](architecture/adr/0032-boutiques-vendeurs.md) (boutiques des vendeurs), [ADR-0033](architecture/adr/0033-produits-vendeurs-moderation.md) (produits des vendeurs, modération), [ADR-0034](architecture/adr/0034-double-authentification-equipe.md) (double authentification de l'équipe), [ADR-0035](architecture/adr/0035-photos-produits-vendeurs.md) (photos des produits des vendeurs), [ADR-0036](architecture/adr/0036-ecrans-equipe.md) (écrans de l'équipe), [ADR-0037](architecture/adr/0037-espace-vendeur.md) (espace vendeur), [ADR-0038](architecture/adr/0038-commandes-vendeurs.md) (commandes des vendeurs), [ADR-0039](architecture/adr/0039-verification-vendeurs.md) (vérification des vendeurs).
Choix du 2026-10-15 : **demande de boutique depuis un compte connecté, validée par un administrateur** ; une boutique par compte ; produits existants dans une **boutique « Kemdia » interne** ;
S6-T01 en **API seule** ; demande **minimum** (nom, ville, mobile, description) ; commission : **en attente du client** (question ouverte n° 3).
Choix du 2026-10-16 (S6-T02) : modération par un **modérateur ou un administrateur** ; **prix et stock libres**, le reste revalidé (produit caché en attendant) ; **photos dans une tâche suivante** ; **API seule**.
Choix du 2026-10-16 (S6-T03) : double authentification **obligatoire pour modérateurs et administrateurs**, **application TOTP**, **codes de secours + commande serveur**, clé `TOTP_ENCRYPTION_KEY` **ajoutée par le propriétaire**.
Choix du 2026-10-16 (S6-T04) : photos rangées **dans PostgreSQL** (port remplaçable), **toujours réencodées**, photo ajoutée = **nouvelle modération**, affichées **par un relais du site**.
Choix du 2026-10-16 (S6-T05) : **écrans de l'équipe d'abord** (espace vendeur ensuite, S6-T06) ; **2FA + boutiques + modération** ; adresse **`/equipe`** ; QR code **dessiné côté serveur** ; **téléphone et ordinateur**.
Choix du 2026-10-16 (S6-T06) : **vraie demande de boutique dans `/vendeur`** (le faux formulaire de `/vendre` disparaît) ; photos **réduites dans le navigateur** ; **chiffres de commission retirés** de `/vendre` ; adresse **`/vendeur`**.
Choix du 2026-10-17 (S6-T07) : réponse du vendeur **sous 24 h** ; refus ou absence de réponse = **commande entière annulée** ; écrans **dans la même tâche** ; encaissement en espèces refusé tant qu'un vendeur n'a pas répondu (relecture de sécurité).
Choix du 2026-10-17 (S6-T08) : photos des pièces **dans PostgreSQL, chiffrées** (clé `KYC_ENCRYPTION_KEY` ajoutée par le propriétaire) ; photos effacées **30 jours** après la décision (à confirmer, question n° 9) ; KYC non validé = **versements seulement** bloqués ; site : **menu du compte, tableau de bord vendeur, pied de page** mis à jour.

| ID     | Tâche                                                                                                                                                                                                                                                                                                      | Statut |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S6-T00 | Kemdia en ligne depuis Docker Desktop (tunnel Cloudflare) pour des tests à distance : scripts `en-ligne.ps1` / `hors-ligne.ps1`, base à part, Brevo — ADR-0031                                                                                                                                             | ✅     |
| S6-T01 | Fondations `vendors` : boutiques (une par compte), demande et examen par l'administration (valider / refuser / suspendre), rôle vendeur dans la même transaction, produits liés à une boutique (boutique Kemdia) — ADR-0032                                                                                | ✅     |
| S6-T02 | Produits des vendeurs et modération (BR-003) : création, invisibles jusqu'à la validation (modérateur ou admin, version lue), contenu modifié → nouvelle modération, prix et stock libres (stock protégé), boutique suspendue = produits cachés — ADR-0033                                                 | ✅     |
| S6-T03 | Double authentification de l'équipe (MED-15) : application TOTP obligatoire pour modérateurs et administrateurs, confirmation par session (15 min), 10 codes de secours, commande `mfa:reset` — ADR-0034                                                                                                   | ✅     |
| S6-T04 | Photos des produits des vendeurs : envoi du fichier (JPEG, PNG, WebP), réencodage WebP sans métadonnées, nouvelle modération, photo publique seulement pour un produit visible, relais du site `/images/v` — ADR-0035                                                                                      | ✅     |
| S6-T05 | Écrans de l'équipe sur le site (`/equipe`) : double authentification (QR code, codes de secours, confirmation), tableau de bord, boutiques (valider / refuser / suspendre), file de modération avec photos — ADR-0036                                                                                      | ✅     |
| S6-T06 | Espace vendeur sur le site (`/vendeur`) : demande de boutique, tableau de bord, produits (création, fiche, prix et stock, retrait de la vente), photos réduites dans le navigateur (envoi, principale, retrait) ; `/vendre` sans faux formulaire ni taux de commission — ADR-0037                          | ✅     |
| S6-T07 | Commandes des vendeurs (BR-013) : une part par boutique, le vendeur voit SES articles et la ville, accepte ou refuse (motif) sous 24 h ; refus ou silence = commande annulée (stock, coupon, remboursement à faire) ; e-mail au vendeur ; pages `/vendeur/commandes` — ADR-0038                            | ✅     |
| S6-T08 | Vérification des vendeurs, KYC (BR-024) : dossier (identité, RCCM, compte de versement) et photos chiffrés, examen par un administrateur (consultations au journal), photos effacées 30 jours après ; pages `/vendeur/verification` et `/equipe/verifications` ; menu du compte selon les rôles — ADR-0039 | ✅     |

Clôture (2026-10-17) : [rapport](rapports/2026-10-17_S6_cloture.md), version **v0.7.0**. **Reporté** : commissions et versements (BR-020, question ouverte n° 3), modération des avis (FR-020, quand les avis existeront), écrans d'administration des factures, encaissements et remboursements, rôles et journal d'audit à l'écran.

## S7 — Module `shipping` + préproduction ✅

Décisions : [ADR-0040](architecture/adr/0040-livraisons-module-shipping.md) (livraisons, module `shipping`), [ADR-0041](architecture/adr/0041-livraisons-ecrans.md) (livraisons à l'écran), [ADR-0042](architecture/adr/0042-accueil-blocage.md) (accueil sous 300 ms), [ADR-0043](architecture/adr/0043-serveur-pile-complete.md) (serveur), [ADR-0044](architecture/adr/0044-sauvegardes-restic.md) (sauvegardes), [ADR-0045](architecture/adr/0045-surveillance-alertes.md) (surveillance), [ADR-0046](architecture/adr/0046-test-intrusion-zap-asvs.md) (test d'intrusion), [ADR-0047](architecture/adr/0047-donnees-personnelles-apdpvp.md) (données personnelles).
Choix du 2026-10-17 (découpage) : transporteur pas encore choisi (question ouverte n° 5) → **port neutre + suivi manuel** ; barème de livraison **en base, réglable** par un administrateur ; préproduction **tout préparée sans louer de serveur** (location à discuter avec le client) ; test d'intrusion **gratuit : OWASP ZAP dans la CI + revue ASVS niveau 1** (pentest externe payant proposé au client avant le lancement).
Choix du 2026-10-17 (S7-T01) : part de Kemdia (BR-021) **arrondie à l'entier inférieur** ; statuts changés par un **administrateur seul** ; échec de livraison = **nouvelle tentative ou annulation** (stock rendu, remboursement « à faire ») ; **API seule** (écrans au S7-T02).
Choix du 2026-10-18 (S7-T02) : barème du site **lu une fois, gardé 5 minutes** (secours : contrat) ; e-mails au client **« en route » et « livrée »** ; le client voit **l'état de la livraison** (sans motif) ; vendeur en **lecture seule** ; site : menu et tableau de bord de l'équipe, commande du client, commandes du vendeur, page « Livraison ».
Choix du 2026-10-18 (S7-T03) : **alléger sans rien retirer** (liens de masse sans préchargement, fenêtre « ville » montée à l'ouverture) ; blocage de l'accueil **bloquant au-delà de 350 ms** (avertissement au-delà de 300 ms) ; carte produit partagée : **les autres pages en profitent**.
Choix du 2026-10-19 (S7-T04) : PostgreSQL **dans Docker sur le VPS**, **un par environnement** ; secrets **tirés sur le serveur** (jamais dans Git ni GitHub) ; vérification par un **job CI qui monte toute la pile**.
Choix du 2026-10-19 (S7-T05) : sauvegardes **sur le serveur + copie S3** (Cloudflare R2 ou équivalent, branché à la location) ; outil **restic** ; **chaque nuit**, rétention 7 jours / 4 semaines / 6 mois ; test CI de **restauration complète** (contenu comparé, API redémarrée).
Choix du 2026-10-19 (S7-T06) : sonde externe **UptimeRobot gratuit** ; alertes internes **Healthchecks.io gratuit** (alerte aussi sur silence) ; journaux du site **en JSON comme l'API**, gardés sur le serveur ; vérification par **pannes simulées en CI**.
Choix du 2026-10-19 (S7-T07) : ZAP **passif à chaque PR, actif chaque semaine** ; espaces connectés **avec comptes de test** ; **moyen ou élevé = CI rouge** (exceptions justifiées) ; **ASVS 5.0** niveau 1 ; écarts : **règle de composition retirée**, **10 000 mots de passe courants**, **changement du mot de passe avec l'actuel ajouté**, délais de correction **7 j / 30 j / sprint suivant**.
Choix du 2026-10-19 (S7-T08) : suppression du compte **par effacement après mot de passe** (refusée si commande en cours ou boutique ouverte) ; **factures gardées 10 ans (OHADA)**, le reste anonymisé ; copie des données **en JSON** dans « Mon compte » ; informations légales **« à compléter »** + question ouverte n°10 ; case **« J'ai 18 ans ou plus »** distincte des conditions ; **pas de bandeau cookies** (cookies strictement nécessaires listés) ; comptes inactifs **effacés après 3 ans, avis par e-mail 30 jours avant**.

| ID     | Tâche                                                                                                                                                                                                                                                                                                                                                                                                                | Statut |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S7-T01 | Fondations `shipping` (BR-021) : barème des zones en base réglable par un administrateur (journal), lu par le devis et la commande ; expédition par commande (en route, livrée, échec, nouvelle tentative, annulation après échec) ; transporteur « manuel » ; part Kemdia 15 % (entier inférieur) ; API seule — ADR-0040                                                                                            | ✅     |
| S7-T02 | Livraisons à l'écran : `/equipe/livraisons` (commandes prêtes, étapes, barème), section « Livraison » de la commande du client (`GET /orders/{n°}/shipment`), état en lecture seule côté vendeur, e-mails « en route » et « livrée » ; site branché sur le barème de l'API (gardé 5 min) — ADR-0041                                                                                                                  | ✅     |
| S7-T03 | Accueil sous 300 ms (dette du S3) : mesures et causes (préchargement de ~30 pages par Next.js), liens de masse sans préchargement, fenêtre « ville » montée à l'ouverture, blocage de l'accueil bloquant au-delà de 350 ms en CI — ADR-0042. **Partiel** : médiane CI 289 ms (247–314), « durablement sous 300 ms » non garanti                                                                                      | 🟡     |
| S7-T04 | Serveur : site + API + PostgreSQL 18 par environnement (réseaux séparés, base sans Internet), secrets tirés sur le serveur (`init-secrets.sh`), `deploy.sh` à deux images avec migrations et dépôt épinglé, `setup-server.sh` renforcé (noyau, SSH, redémarrage de nuit), job CI « Pile serveur » ; sans louer de serveur — ADR-0043                                                                                 | ✅     |
| S7-T05 | Sauvegardes chiffrées (restic, AES-256) chaque nuit : bases, secrets et Caddy, locales + copie S3, rétention 7/4/6 ; `restore.sh` (liste, fichiers, verifier, remplacer) ; vérification de restauration chaque dimanche ; perte du serveur rejouée en CI (restauration depuis S3, contenu identique) — ADR-0044                                                                                                      | ✅     |
| S7-T06 | Surveillance : `monitor.sh` toutes les 5 min (conteneurs, parcours https complet, certificats, disque, mémoire, sauvegardes) vers Healthchecks.io ; `/api/health?complet=1` pour UptimeRobot ; journaux JSON du site ; pannes simulées en CI — ADR-0045                                                                                                                                                              | ✅     |
| S7-T07 | Test d'intrusion : OWASP ZAP 2.17.0 dans la CI (site + API, 4 rôles ; passif à chaque PR, actif chaque dimanche ; moyen ou élevé = rouge) ; revue ASVS 5.0 niveau 1 (70 exigences, 5 écarts corrigés : changement du mot de passe, 10 000 mots de passe courants, sans règle de composition, politique des dépendances) — ADR-0046                                                                                   | ✅     |
| S7-T08 | Conformité APDPVP (loi n°001/2011 modifiée par la loi n°025/2023) : module `privacy` — copie JSON et suppression du compte dans « Mon compte » (mot de passe, refusée si commande ou boutique en cours, factures gardées 10 ans, reste anonymisé), comptes inactifs effacés après 3 ans (avis 30 j avant), case « 18 ans ou plus », pages légales « à compléter », registre des traitements et procédures — ADR-0047 | ✅     |
| S7-T09 | Écrans d'administration reportés du S6 : factures, encaissements à la livraison, remboursements, journal d'audit — **reporté au S7.5** (S7.5-T05)                                                                                                                                                                                                                                                                    | ➡️     |

Clôture (2026-10-19) : [rapport](rapports/2026-10-19_S7_cloture.md), version **v0.8.0**. **Reporté** : S7-T09 (écrans d'administration) au S7.5 ; accueil « durablement sous 300 ms » (S7-T03 partiel, médiane CI 289 ms) ; vrai transporteur (question n° 5), informations légales (question n° 10), location du serveur et pentest externe (à discuter avec le client).

## S7.5 — Sprint correctif ✅

Décisions : [ADR-0048](architecture/adr/0048-ci-parallele.md) (CI plus rapide), [ADR-0049](architecture/adr/0049-fiches-communes-offres.md) (fiche commune et offres), [ADR-0050](architecture/adr/0050-ecrans-fiches-offres.md) (écrans et propositions de correction), [ADR-0051](architecture/adr/0051-roles-equipe-utilisateurs.md) (rôles de l'équipe, Utilisateurs, appareils), [ADR-0052](architecture/adr/0052-ecrans-finance-journal.md) (écrans de la Finance et journal).
Choix du 2026-10-19 (ouverture) : **S7 clôturé sans S7-T09**, repris au S7.5 ; CI : l'image Docker n'attend plus les
tests de bout en bout, **seul le déploiement** attend que tout soit vert.
Choix du 2026-10-19 (remarques du propriétaire) : **fiche produit commune + offres des vendeurs avant la bêta** ;
**rôles détaillés** de l'équipe (catalogue, service client, logistique, finance, administrateur) ; validation des
produits **humaine pendant la bêta**, IA « kemdIA » étudiée après la bêta (serveur GPU à chiffrer).
Choix du 2026-10-20 (S7.5-T02) : **fiche + offres en 2 PR** (API et données, puis écrans) ; le **vendeur crée** une fiche
(modérée), ensuite **seule l'équipe la corrige** ; offre **mise en avant : en stock, la moins chère, puis la plus proche**
(ville du client) ; **neuf seulement** pour la bêta ; une offre sur une fiche en ligne est **publiée tout de suite**.
Choix du 2026-10-20 (S7.5-T03) : **bloc « Autres vendeurs »** sur la page produit ; ville du client par un **cookie de
la ville choisie** ; ajout d'un produit : **chercher d'abord, puis photo d'abord** ; erreur sur une fiche en ligne :
**message libre + file de l'équipe**.
Choix du 2026-10-20 (S7.5-T04) : **5 rôles** (Catalogue, Logistique, Finance, Service client, Administrateur) ; départ
d'un employé : **« Retirer ses rôles » et « Désactiver le compte »**, sessions coupées et tracé ; administrateur
**nommé depuis le serveur seulement** ; avis **« nouvel appareil » pour tous les comptes** avec un lien « ce n'est pas
moi ». Choix du 2026-10-22 : ajout d'un membre par **recherche d'un compte puis rôles** ; cookie d'appareil **1 an** ;
case **« Je confirme »** avant de retirer ou de désactiver.
Choix du 2026-10-22 (S7.5-T05) : factures **liste + recherche + PDF + renvoi au client** ; espèces : **liste « à
encaisser »** ; journal : **liste + filtre par action** ; en plus : **réglages de facturation, codes promo, réglages du
paiement à la livraison**.
Choix du 2026-10-23 (S7.5-T06) : fautes de frappe avec **pg_trgm dans PostgreSQL** ; recherche approchée **seulement
si rien ne correspond** (lien « chercher exactement ») ; suggestions **produits + rayons + marques** ; **dès 2 lettres,
après 250 ms**.
Choix du 2026-10-23 (S7.5-T06b) : failles de Next.js corrigées dans une **PR séparée depuis main**.
Choix du 2026-10-23 (S7.5-T07) : ville et quartier **des listes officielles** ; « près de chez moi » = **même ville, mon
quartier d'abord** ; page publique **infos + produits, sans téléphone** ; accès par **`/boutiques` et la fiche produit** ;
« Ma boutique » : **ville, quartier, description** (nom fixé) ; boutique Kemdia en **« Boutique officielle »**.
Choix du 2026-10-23 (S7.5-T08) : options recommandées retenues à ta demande : photo **visible seulement par le
titulaire**, **initiales** par défaut, **carré de 256 px sans métadonnées**, **effacée avec le compte**.

| ID        | Tâche                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Statut |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S7.5-T01  | CI plus rapide : qualité, base, bout en bout, pile serveur et images en même temps ; déploiements seulement si tout est vert ; production et étiquettes `latest` après des tests verts ; ZAP plus robuste ; CI/CD **13 → 6 min**, passage complet ~13 → ~7 min — ADR-0048                                                                                                                                                                                         | ✅     |
| S7.5-T02  | Fiche commune et offres (API et données) : fiches et déclinaisons communes, chaque produit existant devient une offre sur SA fiche (mêmes adresses, paniers et commandes intacts) ; une carte par fiche, toutes les offres et l'offre mise en avant ; vendre un produit existant (offre en ligne tout de suite) ; contenu verrouillé après publication ; équipe : correction, photo retirée, fusion des doublons, retrait d'une offre ; contrat 1.24.0 — ADR-0049 | ✅     |
| S7.5-T03  | Fiche commune et offres (écrans) : page produit avec « Autres vendeurs » et la ville du client (cookie), « Vendre ce produit » (chercher d'abord, puis photos d'abord), espace de l'équipe « Fiches produits » (correction, photo, retrait d'une offre, fusion en deux temps), propositions de correction des vendeurs (file de l'équipe) ; contrat 1.25.0 — ADR-0050                                                                                             | ✅     |
| S7.5-T04  | Équipe : 5 rôles détaillés (modérateur → Catalogue), écran Utilisateurs (recherche, rôles, « Retirer ses rôles », désactiver / réactiver, sessions coupées), service client en lecture seule (recherche journalisée, commandes), avis « nouvel appareil » (cookie `kemdia_appareil`, lien « ce n'est pas moi ») ; contrat 2.0.0 — ADR-0051 — Choix du 2026-10-20 et du 2026-10-22                                                                                 | ✅     |
| S7.5-T05  | Écrans de la Finance et journal (ex-S7-T09) : factures (liste, recherche, PDF, renvoi au client), espèces à encaisser, remboursements, codes promo, réglages (facturation, paiement à la livraison), journal d'audit (administrateurs, filtre par action et par compte) ; contrat 2.1.0 — ADR-0052 — Choix du 2026-10-22                                                                                                                                          | ✅     |
| S7.5-T06  | Recherche : tolérance aux fautes (pg_trgm, index trigrammes, correction seulement si rien ne correspond, lien « chercher exactement »), suggestions pendant la frappe (produits, rayons, marques, dès 2 lettres) ; contrat 2.2.0 — ADR-0053 — Choix du 2026-10-23                                                                                                                                                                                                 | ✅     |
| S7.5-T06b | Sécurité : Next.js 16.3.8 → 16.4.2 (2 failles critiques d'exécution de code à distance et 1 déni de service, publiées le 2026-10-23) ; audit des dépendances de production à nouveau sans faille — Choix du 2026-10-23                                                                                                                                                                                                                                            | ✅     |
| S7.5-T07  | Boutiques : page publique (infos + produits avec SON prix, sans téléphone), annuaire `/boutiques` (ville de livraison, quartier du client d'abord, boutique officielle en tête), quartier (listes de la livraison), « Ma boutique » (ville, quartier, description sans nouvel examen ; nom fixé), liens depuis la fiche produit ; contrat 2.3.0 — ADR-0054 — Choix du 2026-10-23                                                                                  | ✅     |
| S7.5-T08  | Photo de profil : téléversée (recadrée en carré, sans métadonnées), visible seulement par le titulaire, initiales sur une couleur propre par défaut, dans l'en-tête et « Mon compte » (ajouter, changer, retirer), effacée avec le compte ; contrat 2.4.0 — ADR-0055 — Choix du 2026-10-23                                                                                                                                                                        | ✅     |

Clôture (2026-10-23) : [rapport](rapports/2026-10-23_S7.5_cloture.md), version **v0.8.1** (contrat de l'API 2.4.0). **Reporté** : boutiques dans les suggestions de recherche ; caches en mémoire à déplacer avant plusieurs instances ; photos vers un stockage objet ; questions client n° 3, 5 et 10 ; location du serveur et pentest externe.

Après la bêta : IA « kemdIA » (remplissage depuis la photo, pré-tri des produits), connexion avec Google, distance GPS.

## S8 — Bêta fermée ✅

Décisions : [ADR-0056](architecture/adr/0056-avis-clients.md) (avis des clients),
[ADR-0057](architecture/adr/0057-beta-fermee-signalements.md) (bêta fermée et signalements),
[ADR-0058](architecture/adr/0058-import-catalogue.md) (import du catalogue),
[ADR-0059](architecture/adr/0059-accueil-300ms-etalonnage.md) (accueil durablement sous 300 ms),
[ADR-0060](architecture/adr/0060-accueil-encart-compte.md) (encart du compte de l'accueil),
[ADR-0061](architecture/adr/0061-ci-ubuntu-2404.md) (machines de la CI fixées),
[ADR-0062](architecture/adr/0062-suggestions-boutiques.md) (boutiques dans les suggestions),
[ADR-0063](architecture/adr/0063-boutique-prix-offre.md) (prix de l'offre sur la page d'une boutique),
[ADR-0064](architecture/adr/0064-compteurs-partages-en-base.md) (compteurs partagés en base).
Choix du 2026-10-23 (ouverture) : commencer par **ce qui ne dépend pas du client** ; les tâches qui attendent ses
réponses (transporteur n° 5, informations légales n° 10, commission n° 3, location du serveur) seront ajoutées à leur
arrivée. Options recommandées retenues sans être reposées (ta demande du 2026-10-23), listées dans chaque PR.
Choix du 2026-10-23 (S8-T01) : avis **réservés aux clients livrés** ; **note seule publiée tout de suite**,
**commentaire relu** par l'équipe Catalogue ; prénom et **initiale** de l'auteur ; avis **effacés avec le compte**.
Choix du 2026-10-23 (S8-T02) : bêta fermée par un **interrupteur de l'administrateur** (ouvert au déploiement) ;
invitation **liée à l'adresse**, 30 jours, une fois ; **création de compte seule** fermée ; signalements par les
**comptes connectés**, suivis par le **service client**, effacés 180 jours après leur résolution.
Choix du 2026-10-23 (S8-T03) : import par l'**équipe Catalogue** d'un fichier **CSV** (une ligne par variante,
2 Mo / 1 000 lignes), **vérifié** puis importé **tout ou rien** ; produits **en attente de modération** (photos par la
boutique) ; boutiques **partenaires** seulement ; référence déjà importée **ignorée**. Fichiers réels et photos HD :
**en attente du client**.
Choix du 2026-10-24 (S8-T04) : photos en **simple `<img>`** (mêmes adresses et tailles), **pied de page** rendu
interactif à l'approche ; test de performance au **processeur étalonné** (référence 20 ms, ×2 à ×8), accueil sur
**5 chargements** et **bloquant au-delà de 300 ms**.
Choix du 2026-10-24 (S8-T08) : encart de l'accueil selon la connexion (« Mes commandes », « Mon compte ») et le rôle
vendeur (« Accéder à votre boutique » vers l'espace vendeur), lu comme l'en-tête, rendu par le serveur.
Choix du 2026-10-27 (S8-T09) : machines de la CI **fixées sur `ubuntu-24.04`** pour tous les jobs (Ubuntu 26 casse
l'installation de Chromium) ; passage à une version plus récente par une tâche dédiée.
Choix du 2026-10-27 (S8-T05) : **2 boutiques actives** au plus dans les suggestions, trouvées sur les **mots tapés**
(sans accents, dernier mot incomplet), boutique officielle d'abord ; comparaison dans la requête SQL, **sans migration**.
Choix du 2026-10-27 (S8-T06) : sur la page d'une boutique, filtre et tri par prix, « en promotion » et compteurs lus sur
**son offre** ; même règle de prix que le reste du catalogue (déclinaison active la moins chère), **sans migration**.
Choix du 2026-10-27 (S8-T07) : compteurs dans une **table PostgreSQL partagée** (pas de Redis), fenêtre fixe, **repli en
mémoire** si la base ne répond pas ; caches de lecture (rayons, corrections) **gardés en mémoire**.

| ID     | Tâche                                                                                                                                                                                                                                                                              | Statut |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| S8-T01 | Avis des clients (FR-020) : un avis par fiche réservé aux clients livrés, note seule publiée, commentaire relu par l'équipe Catalogue, note de la fiche tirée des avis réels ; contrat 2.5.0 — ADR-0056 — Choix du 2026-10-23                                                      | ✅     |
| S8-T02 | Bêta fermée : inscription réservée aux adresses invitées (interrupteur de l'administrateur, invitation liée à l'adresse, 30 jours) et « Signaler un problème » suivi par le service client ; contrat 2.6.0 — ADR-0057 — Choix du 2026-10-23                                        | ✅     |
| S8-T03 | Import du vrai catalogue : fichier CSV de l'équipe Catalogue vérifié puis importé tout ou rien, produits en attente de modération (photos par la boutique), sans doublon au second import ; contrat 2.7.0 — ADR-0058 — Choix du 2026-10-23 (fichiers réels : en attente du client) | ✅     |
| S8-T04 | Accueil durablement sous 300 ms (dette S7-T03) : photos en simple `<img>`, pied de page rendu interactif à l'approche, processeur étalonné sur la vitesse de la machine de CI, accueil bloquant au-delà de 300 ms — ADR-0059 — Choix du 2026-10-24                                 | ✅     |
| S8-T05 | Recherche : boutiques dans les suggestions pendant la frappe (dette S7.5) : 2 boutiques actives au plus, trouvées sur les mots tapés sans accents, vers leur page publique ; contrat 2.8.0 — ADR-0062 — Choix du 2026-10-27                                                        | ✅     |
| S8-T06 | Page d'une boutique : filtre et tri par prix (dette S7.5) lus sur le prix de SON offre, « en promotion » et compteurs de prix compris ; contrat 2.8.1 — ADR-0063 — Choix du 2026-10-27                                                                                             | ✅     |
| S8-T07 | Compteurs en mémoire de l'API déplacés en base avant plusieurs instances (dette S7.5) : limites de débit, coupons refusés, renvois de factures, budget de la recherche dans `platform.rate_counters`, repli en mémoire — ADR-0064 — Choix du 2026-10-27                            | ✅     |
| S8-T08 | Accueil : encart du compte selon la connexion (« Mes commandes », « Mon compte » au lieu de « Se connecter ») et le rôle vendeur (« Accéder à votre boutique » au lieu de « Devenir vendeur ») — ADR-0060 — Choix du 2026-10-24                                                    | ✅     |
| S8-T09 | CI : machines fixées sur Ubuntu 24.04 (le passage de `ubuntu-latest` à Ubuntu 26 empêchait d'installer Chromium et bloquait toutes les PR) — ADR-0061 — Choix du 2026-10-27                                                                                                        | ✅     |

Clôture (2026-10-28) : [rapport](rapports/2026-10-28_S8_cloture.md), version **v0.9.0** (contrat de l'API 2.8.1).
Choix du 2026-10-28 : clôturer **sans attendre** les réponses du client ; ce qui en dépend passe au S9, marqué « en
attente du client ».

## S9 — Mise en production (lancement v1.0.0) 🚧

Choix du 2026-10-28 : mettre en production **bientôt**, paiement **à la livraison seulement** ; Airtel Money et Moov
Money **grisés « Bientôt disponible »** tant qu'aucun contrat n'est signé (déjà le cas hors démo : aucun fournisseur
réel). Le détail des tâches sera établi à l'ouverture du S9.
Décisions : [ADR-0065](architecture/adr/0065-2fa-mot-de-passe-explique.md) (étape du mot de passe de la double
authentification),
[ADR-0066](architecture/adr/0066-vignettes-listes-equipe.md) (vignettes des listes de l'équipe).
Choix du 2026-10-28 (S9-T01) : champ vide → **message sous le champ** plutôt qu'un bouton désactivé.
Choix du 2026-10-28 (S9-T02) : vignette **publique (480 px)** pour une fiche publiée, **relais de l'équipe** sinon.

| ID     | Tâche                                                                                                                                                         | Statut                   |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| S9-T01 | Double authentification : « Afficher le QR code » sans mot de passe ne faisait rien ; message et aide ajoutés — ADR-0065 — Choix du 2026-10-28                | ✅                       |
| S9-T02 | Vignette (première photo) dans les listes Fiches produits et Avis clients de l'équipe ; contrat 2.9.0 — ADR-0066 — Choix du 2026-10-28                        | ✅                       |
| S9-T03 | Espace de l'équipe et des vendeurs au niveau des back-offices de référence (Seller Central, Jumia Vendor Center) : mise en page dédiée, tableaux, indicateurs | ⏳ recommandé            |
| S9-??  | Hébergement payant (serveur ou offre payante de Render), nom de domaine, e-mails depuis le domaine                                                            | ⏳ décision du client    |
| S9-??  | Déploiement : un environnement GitHub par cible (staging, production), secrets séparés, production protégée                                                   | à faire avant le serveur |
| S9-??  | Informations légales : mentions, CGV, confidentialité, responsable des traitements (n° 10)                                                                    | ⏳ en attente du client  |
| S9-??  | Transporteur (n° 5), commission des vendeurs (n° 3), règles du paiement à la livraison (n° 1)                                                                 | ⏳ en attente du client  |
| S9-??  | Vrai catalogue et photos HD, comptes de l'équipe, vendeurs partenaires                                                                                        | ⏳ en attente du client  |
| S9-??  | Mobile Money réel (Airtel Money, Moov Money) : contrat avec les opérateurs ou un agrégateur (n° 7)                                                            | ⏳ en attente du client  |

## S5 à S8 — grandes lignes

- **S5 `orders` + `payments`** (détail ci-dessus) : S5-T01 a supprimé `accounts.failed_logins` / `locked_until` (étape 2 de l'ADR-0022) ;
  panier serveur (et vérification du panier par `POST /availability` au passage en caisse), réservation de stock atomique (BR-012), coupons (BR-030), paiement à la livraison sous conditions (BR-011),
  adaptateurs Moov / Airtel en _sandbox_, webhooks signés, idempotence, factures (FR-015).
- **S6 `vendors` + back-office** : boutique, KYC (BR-024), modération des produits (BR-003), commandes vendeur (BR-013), commissions (BR-020), modération des avis.
- **S7 `shipping` + préproduction** : transporteur, commission logistique (BR-021), serveur durci, surveillance, sauvegardes chiffrées testées, test d'intrusion, conformité. Dette S3 : blocage de l'accueil ramené sous 300 ms (387 ms en CI à la fin du S3).
- **S8** : bêta fermée avec les vendeurs partenaires, corrections, lancement.
