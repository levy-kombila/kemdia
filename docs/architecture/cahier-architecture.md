# Cahier d'architecture — Kemdia

| Version  | Date       | Sprint | Changements                                                                                                                                                                                                                                                                                                                                                                   |
| -------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0.1**  | 2026-10-05 | S1     | Création : contexte, exigences, stack, architecture frontend, sécurité, DevOps                                                                                                                                                                                                                                                                                                |
| **0.2**  | 2026-10-05 | S1     | §7 pipeline CD complet, §8 architecture de déploiement (ADR-0005)                                                                                                                                                                                                                                                                                                             |
| **0.3**  | 2026-10-05 | S1     | §8 environnement de démonstration gratuit (Render), version inscrite dans l'image                                                                                                                                                                                                                                                                                             |
| **0.4**  | 2026-10-05 | S2     | Intégration du KSAD : vision et modèle économique (§1), MVP et règles métier (§2), modules du backend (§3.3, ADR-0006), concepts expliqués                                                                                                                                                                                                                                    |
| **0.5**  | 2026-10-05 | S2     | §5.4 parcours d'identité (connexion, inscription, code OTP) et port `AuthClient` ; §6.2 mesures de sécurité des formulaires ; §9 tests                                                                                                                                                                                                                                        |
| **1.0**  | 2026-10-06 | S2     | §2.2 et §9 budget de performance mesuré à chaque PR ; §7 étape performance ; fin du Sprint 2 (v0.2.0)                                                                                                                                                                                                                                                                         |
| **4.0**  | 2026-10-16 | S6     | Double authentification de l'équipe (ADR-0034, MED-15) : §3.4 `TOTP_ENCRYPTION_KEY`, §3.7 routes `/auth/2fa` et contrat 1.16.0, §3.10 actions `mfa.*`, §3.18 (nouvelle), §6.4                                                                                                                                                                                                 |
| **4.1**  | 2026-10-16 | S6     | Photos des produits des vendeurs (ADR-0035) : §3.5 table `catalog.product_images`, §3.7 routes et contrat 1.17.0, §3.10 actions, §3.19 (nouvelle), §5.14 (nouvelle), §6.4                                                                                                                                                                                                     |
| **4.2**  | 2026-10-16 | S6     | Écrans de l'équipe sur le site (ADR-0036) : §5.1 dossiers `app/equipe`, `components/staff`, `lib/staff`, §5.15 (nouvelle), §6.4, §7 données de test de l'équipe en CI                                                                                                                                                                                                         |
| **4.3**  | 2026-10-16 | S6     | Espace vendeur sur le site (ADR-0037) : §5.1 dossiers `app/vendeur`, `components/vendor`, `lib/vendor`, §5.16 (nouvelle), §6.4, §7 données de test des vendeurs, §8 corps de requête borné à 6 Mo (Caddy)                                                                                                                                                                     |
| **4.4**  | 2026-10-17 | S6     | Commandes des vendeurs (ADR-0038, BR-013) : §3.20 (nouvelle) parts de commande par boutique, réponse sous 24 h, annulation entière ; contrat 1.18.0 ; §5.16 pages « Mes commandes »                                                                                                                                                                                           |
| **4.5**  | 2026-10-17 | S6     | Vérification des vendeurs, KYC (ADR-0039, BR-024) : §3.21 (nouvelle) dossier chiffré (AES-256-GCM, `KYC_ENCRYPTION_KEY`), examen par un administrateur, photos effacées 30 jours après la décision ; contrat 1.19.0 ; §5.16 pages « Vérification » ; menu du compte selon les rôles                                                                                           |
| **4.6**  | 2026-10-17 | S6     | Clôture du Sprint 6 : version v0.7.0 (« vendeurs partenaires opérationnels »), contrat de l'API 1.19.0 ; aucune section technique modifiée                                                                                                                                                                                                                                    |
| **4.7**  | 2026-10-17 | S7     | Livraisons, module `shipping` (ADR-0040, BR-021) : §3.3 sens de la dépendance `shipping` → `orders`, §3.7 routes des livraisons, §3.22 (nouvelle) barème réglable, expéditions, part de Kemdia de 15 % ; contrat 1.20.0                                                                                                                                                       |
| **4.8**  | 2026-10-18 | S7     | Livraisons à l'écran (ADR-0041) : §3.7 route client de la livraison, §3.22 e-mails « en route » et « livrée », §5.15 pages `/equipe/livraisons`, §5.16 état de la livraison côté vendeur, §5.17 (nouvelle) barème du site gardé 5 min ; contrat 1.21.0                                                                                                                        |
| **4.9**  | 2026-10-18 | S7     | Accueil sous 300 ms (ADR-0042) : §5.2 liens de masse sans préchargement, fenêtre « ville » montée à l'ouverture ; §9 blocage de l'accueil bloquant au-delà de 350 ms                                                                                                                                                                                                          |
| **4.10** | 2026-10-19 | S7     | Serveur (ADR-0043) : §8 site + API + PostgreSQL 18 par environnement, réseaux edge / app / private, secrets tirés sur le serveur, migrations avant la bascule, dépôt d'images épinglé, job CI « Pile serveur »                                                                                                                                                                |
| **4.11** | 2026-10-19 | S7     | Sauvegardes (ADR-0044) : §8 restic chaque nuit (bases, secrets, Caddy), copie S3, rétention 7/4/6, restauration vérifiée chaque semaine, perte du serveur rejouée en CI                                                                                                                                                                                                       |
| **4.12** | 2026-10-19 | S7     | Surveillance (ADR-0045) : §8 UptimeRobot sur `/api/health?complet=1`, `monitor.sh` toutes les 5 min vers Healthchecks.io (conteneurs, HTTPS, certificats, disque, mémoire, sauvegardes), journaux JSON du site                                                                                                                                                                |
| **4.13** | 2026-10-19 | S7     | Test d'intrusion (ADR-0046) : §3.7 `POST /auth/password/change` (contrat 1.22.0) ; §6 mots de passe sans règle de composition, 10 000 refusés ; §7 OWASP ZAP (passif à chaque PR, actif chaque semaine, quatre rôles), revue ASVS 5.0 niveau 1, politique des dépendances                                                                                                     |
| **4.14** | 2026-10-19 | S7     | Données personnelles, APDPVP (ADR-0047) : §3.23 (nouvelle) module `privacy`, copie JSON, suppression du compte, comptes inactifs (3 ans, avis 30 jours avant), anonymisation des commandes et paiements, contrat 1.23.0 ; §5.1 « Mes données », pages légales ; §6 consentement « 18 ans ou plus », registre des traitements                                                  |
| **4.15** | 2026-10-19 | S7     | Clôture du Sprint 7 (v0.8.0) : aucun changement d'architecture ; versions des paquets 0.8.0, contrat de l'API 1.23.0 inchangé                                                                                                                                                                                                                                                 |
| **4.16** | 2026-10-19 | S7.5   | CI plus rapide (ADR-0048) : §7 jobs en parallèle, déploiements, production et étiquettes `main`/`latest` conditionnés aux tests verts ; ZAP plus robuste (code de sortie, mémoire, jetons retirés des artefacts) ; CI/CD 13 → 6 min                                                                                                                                           |
| **4.17** | 2026-10-20 | S7.5   | Fiche commune et offres (ADR-0049) : §3.24 (nouvelle) fiches, déclinaisons, offres, offre mise en avant, déclencheurs de la base, routes des vendeurs et de l'équipe ; §3.6 lecture publique par fiche ; §3.12 réservation limitée aux fiches en ligne ; contrat 1.24.0                                                                                                       |
| **4.18** | 2026-10-20 | S7.5   | Écrans de la fiche commune (ADR-0050) : §3.24 page produit « Autres vendeurs » et cookie `kemdia_ville`, « Vendre ce produit » (chercher d'abord, photos d'abord), espace de l'équipe « Fiches produits », propositions de correction (`catalog.listing_corrections`, 3 routes, 2 actions d'audit) ; contrat 1.25.0                                                           |
| **4.19** | 2026-10-22 | S7.5   | Rôles détaillés et écran Utilisateurs (ADR-0051) : §3.25 (nouvelle) rôles Catalogue, Logistique, Finance, Service client, Administrateur, écran Utilisateurs, service client en lecture seule, appareils connus et lien « ce n'est pas moi » ; §2 rôles mis à jour ; contrat 2.0.0                                                                                            |
| **4.20** | 2026-10-22 | S7.5   | Écrans de la Finance et journal (ADR-0052) : §3.26 (nouvelle) factures (liste, PDF, renvoi), espèces à encaisser, remboursements, codes promo, réglages, journal d'audit à l'écran ; 4 routes ; contrat 2.1.0                                                                                                                                                                 |
| **4.21** | 2026-10-23 | S7.5   | Recherche (ADR-0053) : §3.27 (nouvelle) extension pg_trgm et index trigrammes, correction des fautes de frappe si rien ne correspond (`correctedQuery`, `exact=1`), suggestions pendant la frappe (route `GET /products/suggestions`, relais du site) ; contrat 2.2.0                                                                                                         |
| **4.22** | 2026-10-23 | S7.5   | Sécurité (S7.5-T06b) : §4 Next.js 16.3 → **16.4** (16.4.2 : failles critiques corrigées)                                                                                                                                                                                                                                                                                      |
| **4.23** | 2026-10-23 | S7.5   | Boutiques publiques (ADR-0054) : §3.28 (nouvelle) quartier des boutiques (listes de la livraison), copie publique enrichie `catalog.sellers`, « Ma boutique » (`PATCH /vendors/shop`), annuaire `GET /shops` (quartier du client d'abord), page `GET /shops/{slug}`, filtre `shop` des produits ; pages `/boutiques`, `/boutique/{slug}`, `/vendeur/boutique` ; contrat 2.3.0 |
| **4.24** | 2026-10-23 | S7.5   | Photo de profil (ADR-0055) : §3.29 (nouvelle) table `identity.account_avatars`, `accounts.avatar_version`, routes `/auth/avatar` (envoi recadré sans métadonnées, lecture privée, retrait), `AccountView.avatar`, relais `/compte/photo`, initiales par défaut ; effacée avec le compte ; contrat 2.4.0                                                                       |
| **4.25** | 2026-10-23 | S7.5   | Clôture du Sprint 7.5 (v0.8.1) : aucun changement d'architecture ; versions des paquets 0.8.1, contrat de l'API 2.4.0 inchangé                                                                                                                                                                                                                                                |
| **4.26** | 2026-10-23 | S8     | Avis des clients (ADR-0056) : §3.30 (nouvelle) module `reviews` (schéma `reviews`), achat livré vérifié par les ports de catalog et orders, modération des commentaires par l'équipe Catalogue, note des fiches tirée des avis publiés ; contrat 2.5.0                                                                                                                        |
| **4.27** | 2026-10-23 | S8     | Bêta fermée et signalements (ADR-0057) : §3.31 (nouvelle) réglage `identity.beta_settings` et invitations `identity.beta_invitations` (inscription réservée aux adresses invitées, vérifiée avant l'existence du compte), module `feedback` (schéma `feedback`) « Signaler un problème » suivi par le service client ; contrat 2.6.0                                          |
| **4.28** | 2026-10-23 | S8     | Import du vrai catalogue (ADR-0058) : §3.32 (nouvelle) fichier CSV vérifié puis importé tout ou rien par l'équipe Catalogue, produits en attente de modération, colonne `catalog.products.import_reference` unique par boutique ; contrat 2.7.0                                                                                                                               |
| **4.29** | 2026-10-24 | S8     | Accueil durablement sous 300 ms (ADR-0059) : §3.33 (nouvelle) photos en simple `<img>` (`getImageProps`), pied de page rendu interactif à l'approche, processeur étalonné dans le test de performance, accueil bloquant au-delà de 300 ms ; §5.2 ; §9                                                                                                                         |
| **4.30** | 2026-10-24 | S8     | Accueil, encart du compte (ADR-0060) : §3.34 (nouvelle) « Se connecter » remplacé par « Mes commandes » / « Mon compte » pour un client connecté, « Accéder à votre boutique » pour un vendeur                                                                                                                                                                                |
| **4.31** | 2026-10-27 | S8     | Machines de la CI fixées (ADR-0061) : §3.35 (nouvelle) tous les jobs sur `ubuntu-24.04` au lieu de `ubuntu-latest` (Chromium de Playwright ne s'installait plus sur Ubuntu 26)                                                                                                                                                                                                |
| **4.32** | 2026-10-27 | S8     | Boutiques dans les suggestions (ADR-0062) : §3.36 (nouvelle) 2 boutiques actives au plus, trouvées sur les mots tapés, sans accents ; contrat 2.8.0 ; §3.27 renvoie à §3.36                                                                                                                                                                                                   |
| **4.33** | 2026-10-27 | S8     | Page d'une boutique, prix de SON offre (ADR-0063) : §3.37 (nouvelle) filtre, « en promotion », compteurs de prix et tri par prix lus sur l'offre de la boutique ; contrat 2.8.1                                                                                                                                                                                               |
| **4.34** | 2026-10-27 | S8     | Compteurs partagés en base (ADR-0064) : §3.38 (nouvelle) table `platform.rate_counters` pour les limites de débit, les coupons refusés, les renvois de factures et le budget de la recherche ; repli en mémoire ; `RATE_LIMIT_STORE` ; §3.7 « Limitation de débit » mise à jour                                                                                               |
| **3.9**  | 2026-10-16 | S6     | Produits des vendeurs et modération (ADR-0033) : §3.3, §3.6 visibilité, §3.7 routes et contrat 1.15.0, §3.10 actions d'audit, §3.17 (nouvelle), §6.4                                                                                                                                                                                                                          |
| **3.8**  | 2026-10-15 | S6     | Boutiques des vendeurs (ADR-0032) : §3.3 module `vendors`, §3.5 schéma `vendors`, §3.7 routes et contrat 1.14.0, §3.10 actions d'audit, §3.16 (nouvelle), §6.4                                                                                                                                                                                                                |
| **3.7**  | 2026-10-15 | S6     | Kemdia en ligne depuis Docker Desktop par un tunnel Cloudflare (ADR-0031) : §8.1 (nouvelle)                                                                                                                                                                                                                                                                                   |
| **3.6**  | 2026-10-15 | S5     | Fin du Sprint 5, v0.5.0 (ADR-0030) : §3.13 code promo de démonstration `DEMO10`, §5.13 (nouvelle : page `/demo` et bandeau), §7 CI allégée pour les PR de documentation                                                                                                                                                                                                       |
| **3.5**  | 2026-10-15 | S5     | Site branché sur les commandes (ADR-0029) : §3.7 contrat 1.13.0, §3.12 Mobile Money selon le fournisseur, §3.14 annulation par le client, §5.7 tunnel branché, §5.12 (nouvelle : « Mes commandes »), §6.4, §7 job e2e                                                                                                                                                         |
| **3.4**  | 2026-10-15 | S5     | Factures (ADR-0028) : §3.4 dossier `src/mail/`, §3.7 routes et contrat 1.12.0, §3.10 action d'audit, §3.15 (nouvelle), §6.4                                                                                                                                                                                                                                                   |
| **3.3**  | 2026-10-11 | S5     | Notifications signées et bac à sable (ADR-0027) : §3.7 routes et contrat 1.11.0, §3.14 notifications et opérateur simulé, §5.11 (nouvelle), §6.4                                                                                                                                                                                                                              |
| **3.2**  | 2026-10-10 | S5     | Paiements (ADR-0026) : §3.3 module `payments`, §3.5 schéma `payments`, §3.7 routes et contrat 1.10.0, §3.10 actions d'audit, §3.14 (nouvelle), §6.4                                                                                                                                                                                                                           |
| **3.1**  | 2026-10-10 | S5     | Coupons (ADR-0025) : §3.7 routes `/admin/coupons` et contrat 1.9.0, §3.10 actions d'audit, §3.13 (nouvelle), §6.4                                                                                                                                                                                                                                                             |
| **3.0**  | 2026-10-10 | S5     | Commandes (ADR-0024) : §2.1 F7 · F8, §3.5 schéma `orders`, §3.7 routes `/orders` et contrat 1.8.0, §3.12 (nouvelle : commandes, réservation du stock), §5.7 barèmes dans le contrat, §6.4                                                                                                                                                                                     |
| **2.9**  | 2026-10-10 | S5     | Panier serveur (ADR-0023) : §2.1 F4, §3.3 et §3.5 module et schéma `orders`, §3.7 routes `/cart`, §3.9 colonnes supprimées, §3.11 (nouvelle), §5.10 (nouvelle), §6.4                                                                                                                                                                                                          |
| **2.8**  | 2026-10-09 | S4     | Fin du Sprint 4 (v0.4.0) : écran de réveil de la démo (ADR-0022, §5.2, §5.9), colonnes obsolètes ignorées (§3.9) ; rapport de clôture                                                                                                                                                                                                                                         |
| **2.7**  | 2026-10-09 | S4     | CSRF, CSP à nonce, limites (ADR-0021) : §3.7 limitation de débit, §5.2 rendu à la demande, §5.4 proxy, §5.9 `CLIENT_IP_HEADER`, §6                                                                                                                                                                                                                                            |
| **2.6**  | 2026-10-08 | S4     | Rôles et journal d'audit (ADR-0020) : §3.3 module `audit`, §3.5 schéma `audit`, §3.7 routes `/admin`, §3.9 rôles, §3.10 (nouvelle), §6                                                                                                                                                                                                                                        |
| **2.5**  | 2026-10-08 | S4     | Site branché sur l'identité (ADR-0019) : §5.4 réécrit (actions serveur, cookies, en-tête, Mon compte), §6.2 mesures du site                                                                                                                                                                                                                                                   |
| **2.4**  | 2026-10-08 | S4     | Mot de passe oublié (ADR-0018) : §3.7 routes `/auth/password/*` ; §3.9 `reset_tickets`, version du mot de passe ; §6.3                                                                                                                                                                                                                                                        |
| **2.3**  | 2026-10-08 | S4     | Connexion et sessions (ADR-0017) : §3.7 routes `/auth/login`, `/session`, `/logout` ; §3.9 blocage par identifiant, sessions, ménage ; §6.3                                                                                                                                                                                                                                   |
| **2.2**  | 2026-10-07 | S4     | Inscription et e-mails (ADR-0016) : §3.4 variables e-mail, §3.7 routes `/auth/signup`, §3.9 tickets et envoi, §6.3                                                                                                                                                                                                                                                            |
| **2.1**  | 2026-10-07 | S4     | Fondations du module `identity` (ADR-0015) : §3.4 `SMS_ENABLED`, §3.5, §3.9 (nouvelle), §5.4 SMS différé, §6.3, §6.4                                                                                                                                                                                                                                                          |
| **2.0**  | 2026-10-07 | S3     | Fin du Sprint 3 (v0.3.0) : démo avec `CATALOG_TIMEOUT_MS=90000` (§5.9) ; rapport de clôture                                                                                                                                                                                                                                                                                   |
| **1.9**  | 2026-10-07 | S3     | Dette S3-T08 : mode fichier retiré (§3.2, §5.9), accueil chargé zone par zone (§5.2), TypeScript 6 / ESLint 10 (§4, ADR-0014), §7, §9                                                                                                                                                                                                                                         |
| **1.8**  | 2026-10-07 | S3     | Démo Render avec l'API et une base Neon (ADR-0013) : §3.2, §3.5, §3.8 démarrage de démo, §5.9, §7 jobs image de l'API et démo, §8, §9                                                                                                                                                                                                                                         |
| **1.7**  | 2026-10-06 | S3     | Image Docker de l'API et migrations au déploiement (ADR-0012) : §3.5, §3.8 (nouvelle), §6.3, §7 job « image de l'API », §8, §9                                                                                                                                                                                                                                                |
| **1.6**  | 2026-10-06 | S3     | Le site lit l'API (ADR-0011) : §3.2, §3.7 contrat `packages/contracts`, §5.1, §5.2, §5.7 panier par variante, §5.9 (nouvelle), §6.2, §7, §9                                                                                                                                                                                                                                   |
| **1.5**  | 2026-10-06 | S3     | §3.7 API REST `/api/v1` et documentation OpenAPI (ADR-0010) ; §3.4 `docs/`, variables ; §4 ; §6.3 limitation de débit ; §9 tests de contrat                                                                                                                                                                                                                                   |
| **1.4**  | 2026-10-06 | S3     | BR-005 : 3 niveaux de catégories (domaine + déclencheur SQL) ; Fitness déplacé sous Sport & Loisirs ; §2.1, §3.6, §6.3, §9                                                                                                                                                                                                                                                    |
| **1.3**  | 2026-10-06 | S3     | §3.6 module `catalog` (ADR-0009) : domaine, cas d'utilisation, persistance, import de démonstration ; §2.1 F3 ; §6.3 ; §9 tests                                                                                                                                                                                                                                               |
| **1.2**  | 2026-10-06 | S3     | §3.5 base de données (ADR-0008) ; §3.4 dossier `database/`, `DATABASE_*` ; §4, §6.3, §7 job PostgreSQL, §8, §9 tests d'intégration                                                                                                                                                                                                                                            |
| **1.1**  | 2026-10-06 | S3     | §3.4 socle de l'API (`apps/api`, ADR-0007) ; §4 versions du backend ; §6.3 sécurité de l'API (ancien §6.3 → §6.4) ; §7 et §9 tests de l'API                                                                                                                                                                                                                                   |
| **0.9**  | 2026-10-06 | S2     | §5.8 favoris, partage et aperçus, page vendeur ; §5.2 rendu à la demande (`SITE_URL`) ; §7 et §9 tests de bout en bout                                                                                                                                                                                                                                                        |
| **0.8**  | 2026-10-05 | S2     | §5.7 tunnel de commande (port `OrderClient`, données envoyées) ; §6.2 mesures du tunnel                                                                                                                                                                                                                                                                                       |
| **0.7**  | 2026-10-05 | S2     | §5.6 pages de liste (filtres) et panier ; §6.2 filtres par liste blanche                                                                                                                                                                                                                                                                                                      |
| **0.6**  | 2026-10-05 | S2     | §5.5 charte graphique « place de marché » (Archivo à largeur variable, étiquette de prix), §5.6 structure des pages, §5.1 composants                                                                                                                                                                                                                                          |

> Document vivant : chaque rapport de sprint (`docs/rapports/`) indique quelles sections il a modifiées.
> Les sections marquées 🔜 seront rédigées au sprint indiqué.

---

## 1. Contexte et objectifs

**Kemdia** est une **marketplace hybride** destinée au marché africain, lancée d'abord au **Gabon** :
Kemdia vend son propre stock **et** accueille des vendeurs tiers, avec paiement Mobile Money et livraison organisée.
Vision détaillée, personas et analyse de marché : [synthèse du KSAD](../references/ksad-synthese.md) (Volumes 1 et 2).

### 1.1 Modèle économique

| Source de revenus             | Règle                                                   | Réf.   |
| ----------------------------- | ------------------------------------------------------- | ------ |
| Vente directe                 | Marge sur le stock propre de Kemdia                     | —      |
| Commission marketplace        | 8 % à 14 % sur les ventes des vendeurs tiers            | BR-020 |
| Affiliation (social commerce) | Partage de commission avec des ambassadeurs (après MVP) | BR-022 |
| Logistique                    | 15 % de chaque frais de livraison                       | BR-021 |

### 1.2 MVP — lancement visé fin 2027

| Élément   | Périmètre                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| Catalogue | ~500 produits : stock Kemdia + **50 vendeurs partenaires**                                                     |
| Comptes   | Inscription et connexion par **e-mail ou téléphone** (code OTP)                                                |
| Paiement  | **Moov Money, Airtel Money, paiement à la livraison**                                                          |
| Livraison | Transporteur partenaire (ex. COMAT), Libreville d'abord, 13 villes au catalogue des tarifs                     |
| Support   | WhatsApp Business + tchat                                                                                      |
| Hors MVP  | 2FA client, portefeuille Kemdia Pay v2, publicité vendeurs, suivi GPS, application mobile, expansion régionale |

### 1.3 Objectifs mesurables

| Objectif                        | Indicateur                                                            |
| ------------------------------- | --------------------------------------------------------------------- |
| Adoption                        | 5 000 acheteurs inscrits après le lancement                           |
| Paiement adapté au marché       | 90 % des transactions en Mobile Money                                 |
| Satisfaction                    | Note moyenne > 4/5 sur les premières commandes                        |
| Site rapide sur mobile en 3G/4G | Page d'accueil < 50 Ko compressée hors images ; pages critiques < 2 s |
| Sécurité de niveau production   | 0 faille critique/haute ouverte avant mise en ligne                   |
| Livraison fiable                | Délai respecté ≥ 95 %                                                 |

**Zone de couverture phase 1** : 13 villes du Gabon réparties en 4 zones tarifaires
(Libreville, Port-Gentil, Franceville, Lambaréné, Oyem, Moanda, Mouila, Tchibanga, Koulamoutou, Bitam, Mitzic, Lastourville, Makokou).

## 2. Exigences

### 2.1 Fonctionnelles

Les **règles métier** (BR-xxx) et les **exigences fonctionnelles** (FR-xxx) issues du KSAD sont numérotées, rattachées à un module
et à un sprint dans [`regles-metier.md`](regles-metier.md). Résumé :

| #   | Exigence                                                                 | Sprint                                        |
| --- | ------------------------------------------------------------------------ | --------------------------------------------- |
| F1  | Parcourir le catalogue par catégories (3 niveaux au plus, BR-005)        | S1 ✅                                         |
| F2  | Rechercher, filtrer, trier, paginer                                      | S1 ✅ · S2 (filtres) · S3 (serveur)           |
| F3  | Fiche produit (photos, prix, stock, livraison estimée, variantes)        | S1 ✅ · S3 ✅ (variantes, API)                |
| F4  | Panier                                                                   | S1 ✅ (navigateur) · S5 ✅ (serveur)          |
| F5  | Ville / quartier de livraison au Gabon                                   | S1 ✅                                         |
| F6  | Compte client par e-mail ou téléphone (OTP)                              | S4                                            |
| F7  | Commander et payer (Moov Money, Airtel Money, à la livraison)            | S5 (commande ✅ S5-T02 ; paiement S5-T04/T05) |
| F8  | Suivre sa commande                                                       | S5 (statuts et historique ✅ S5-T02) · S7     |
| F9  | Vendeurs tiers : boutique, KYC, produits modérés, commandes, commissions | S6                                            |
| F10 | Back-office : modération, KYC, commandes, livraisons                     | S6                                            |
| F11 | Livraison via transporteur partenaire                                    | S7                                            |
| F12 | Affiliation                                                              | Après MVP                                     |

### 2.2 Non fonctionnelles

| Domaine        | Exigence                                                                                                                                                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Performance    | Rendu serveur, images WebP/AVIF redimensionnées, aucun CDN tiers bloquant. **Budget vérifié à chaque PR** (téléphone, 3G 1,6 Mbit/s, latence 300 ms, cache vide) : premier affichage ≤ 2 s, plus grand élément ≤ 2,5 s, décalages ≤ 0,1, JavaScript ≤ 300 Ko |
| Accessibilité  | Navigation clavier, libellés ARIA, contraste, lien d'évitement, `prefers-reduced-motion`                                                                                                                                                                     |
| SEO            | URL lisibles en français, métadonnées par page, sitemap, données structurées `Product`                                                                                                                                                                       |
| Sécurité       | Voir §6 — OWASP Top 10, en-têtes, validation stricte, secrets hors Git                                                                                                                                                                                       |
| Qualité        | Lint + types + tests obligatoires en CI ; revue de code par PR                                                                                                                                                                                               |
| Exploitabilité | Image Docker, configuration par variables d'environnement, logs sans données personnelles                                                                                                                                                                    |
| Conformité     | Loi gabonaise n°001/2011 sur la protection des données personnelles (APDPVP)                                                                                                                                                                                 |
| Disponibilité  | Objectif 99,9 % en production (KSAD Vol. 2), sauvegardes testées, surveillance                                                                                                                                                                               |

## 3. Vue d'ensemble

### 3.1 Contexte (C4 niveau 1)

```mermaid
flowchart LR
    client([Client<br/>mobile / ordinateur])
    admin([Équipe Kemdia<br/>back-office])
    kemdia[[Plateforme Kemdia]]
    mm[(Airtel Money<br/>Moov Money)]
    mail[(Service e-mail / SMS)]
    client -- HTTPS --> kemdia
    admin -- HTTPS --> kemdia
    kemdia -- API paiement + webhooks --> mm
    kemdia -- notifications --> mail
```

### 3.2 Conteneurs (C4 niveau 2) — cible

```mermaid
flowchart TB
    subgraph Navigateur
      ui[Site Kemdia<br/>React — HTML rendu serveur + îlots interactifs]
    end
    subgraph Serveur
      web[apps/web<br/>Next.js 16 — Node 22]
      api[apps/api<br/>NestJS — S3]
      db[(PostgreSQL 18 — S3)]
      cache[(Redis — sessions, limitation de débit — S4)]
    end
    ui -- HTTPS --> web
    web -- HTTP interne --> api
    api --> db
    api --> cache
    api -- paiement --> mm[(Mobile Money)]
```

**État au Sprint 1** : seul `apps/web` existe ; le catalogue provient d'un fichier de démonstration
lu côté serveur par `src/lib/catalog.ts`, qui sera remplacé par des appels à l'API sans modifier les composants.

**État au S3-T02** : `apps/api` existe (socle, contrôle de santé, aucune route métier) et se connecte à PostgreSQL ;
le module `catalog` (S3-T03) lit et écrit catégories, produits et variantes ; ses routes HTTP arrivent au S3-T04,
exposé en HTTP sous `/api/v1` (S3-T04, §3.7) ; le site l'appellera au S3-T05.

**État au S3-T05** : le serveur du site lit le catalogue **dans l'API** (§5.9, [ADR-0011](adr/0011-site-branche-api.md)) ;
le navigateur ne l'appelle jamais directement. Le fichier de démonstration ne sert plus qu'à la démo Render, jusqu'au S3-T07.

**État au S3-T07** : la démo publique fait tourner les **trois** conteneurs — site et API sur Render Free, PostgreSQL sur Neon Free —
([ADR-0013](adr/0013-demo-render-api-neon.md), §8). Sur Render gratuit, le site appelle l'API par son **adresse publique** (HTTPS + clé interne) :
un service gratuit ne reçoit pas de trafic privé. Le fichier de démonstration ne sert plus qu'au développement sans base (retrait au S3-T08).

**État au S3-T08** : le site lit **toujours** l'API, dans tous les environnements (développement compris) ; sans `API_URL` ni clé,
il refuse de démarrer. Les données de démonstration ne servent plus qu'à remplir la base (`db:seed`, démo Render).

### 3.3 Modules du backend (cible MVP)

Monolithe modulaire NestJS, architecture hexagonale, un schéma PostgreSQL par module
([ADR-0006](adr/0006-monolithe-modulaire-7-modules.md) — explications simples dans [concepts.md](concepts.md)).

```mermaid
flowchart LR
    web[apps/web<br/>Next.js] -->|REST /api/v1| api
    subgraph api[apps/api — NestJS]
      identity[identity]
      catalog[catalog]
      vendors[vendors]
      orders[orders]
      payments[payments]
      shipping[shipping]
      notif[notifications]
      audit[audit<br/>journal — S4-T06]
    end
    identity -->|actions sensibles| audit
    orders -->|prix, stock| catalog
    orders -->|encaisser| payments
    shipping -->|expédier, barème| orders
    vendors -->|produits à modérer| catalog
    vendors -->|rôle vendeur| identity
    payments -->|adaptateurs| mm[(Airtel Money<br/>Moov Money)]
    shipping -->|adaptateur| tr[(Transporteur)]
    api --> db[(PostgreSQL<br/>1 schéma par module)]
```

Le module **`audit`** (S4-T06, [ADR-0020](adr/0020-roles-journal-audit.md)) est un module de service : il ne dépend d'aucun autre,
n'a pas de route, et chaque module y inscrit ses actions sensibles (`AuditLog.record`) dans la même transaction que l'action.
Les routes protégées par rôle utilisent `@Authorize(…)`, exporté par `identity`.

Le module **`orders`** existe depuis le S5-T01 (§3.11, [ADR-0023](adr/0023-panier-serveur.md)) : panier serveur du compte connecté ;
il lit le catalogue par son port public (`CatalogService.describeLines`) et protège ses routes avec `SessionGuard`.

Le module **`payments`** existe depuis le S5-T04 (§3.14, [ADR-0026](adr/0026-paiements.md)) : essais Mobile Money, encaissement à la
livraison, remboursements. Il passe par le port public `OrderPayments` du module `orders`, seul à changer le statut d'une commande.

Le module **`vendors`** existe depuis le S6-T01 (§3.16, [ADR-0032](adr/0032-boutiques-vendeurs.md)) : boutiques des vendeurs, demande
et examen par l'administration. Il accorde et retire le rôle `vendor` par le port public `RoleService` du module `identity`, dans la
même transaction que la décision ; chaque produit du catalogue désigne sa boutique par `shop_id` (UUID, sans relation).

### 3.4 Socle de l'API (`apps/api`, S3-T01)

Décision : [ADR-0007](adr/0007-socle-api-nestjs.md).

```
apps/api/
├── src/
│   ├── main.ts               Démarrage : configuration validée → application → écoute
│   ├── app.module.ts         Assemblage : configuration, journaux, santé, puis les modules métier
│   ├── config/               Schéma Zod des variables d'environnement (loadConfig) + jeton APP_CONFIG
│   ├── http/                 Réglages HTTP communs (configure-app), journaux, format des erreurs
│   ├── database/             Connexion PostgreSQL (PrismaService) et santé de la base (S3-T02)
│   ├── docs/                 Description OpenAPI générée + page /api/docs (S3-T04)
│   ├── generated/            Client Prisma généré (pnpm generate) — hors Git
│   ├── health/               GET /api/health (+ schéma de réponse)
│   └── modules/              Modules métier (catalog au S3-T03) — organisation : modules/README.md
├── prisma/
│   ├── schema/               main.prisma + un fichier par module (catalog.prisma…)
│   └── migrations/           Historique des migrations SQL (un seul pour tous les modules)
├── prisma.config.ts          Emplacements du schéma et des migrations, adresse de la base
├── test/                     Tests HTTP, tests d'architecture (code et schéma Prisma), intégration (*.int.test.ts)
└── .env.example              Liste commentée des variables
```

**Chemin d'une requête**

```mermaid
flowchart LR
    req([Requête]) --> h[Helmet<br/>en-têtes] --> c[CORS<br/>fermé par défaut] --> b[Corps JSON<br/>≤ 100 Ko]
    b --> r{Route<br/>/api/health · /api/v1/…}
    r --> ctl[Contrôleur du module]
    r -->|inconnue| f
    ctl -->|erreur| f[Filtre d'erreurs<br/>Problem Details]
    ctl --> res([Réponse JSON<br/>+ X-Request-Id])
    f --> res
```

**Organisation d'un module** (hexagonale, vérifiée par `test/architecture.test.ts`) :
`domain/` (règles pures) ← `application/` (cas d'utilisation et ports) ← `infrastructure/` (Prisma…) et `interface/` (HTTP).
Un autre module n'entre que par `index.ts`.

**Configuration** (vérifiée au démarrage ; liste complète dans `apps/api/.env.example`) :

| Variable                        | Défaut                          | Règle en production                                                                                                                       |
| ------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                      | `development`                   | `production`                                                                                                                              |
| `APP_ENV`                       | `local`                         | `demo`, `staging` ou `production`                                                                                                         |
| `APP_VERSION`                   | `dev`                           | **Obligatoire** (fournie par le pipeline)                                                                                                 |
| `HOST`, `PORT`                  | `0.0.0.0:4000`                  | —                                                                                                                                         |
| `LOG_LEVEL`                     | `info`                          | `debug` et `trace` **interdits**                                                                                                          |
| `CORS_ORIGINS`                  | vide (fermé)                    | HTTPS uniquement                                                                                                                          |
| `TRUST_PROXY`                   | `0`                             | `1` derrière Caddy                                                                                                                        |
| `DATABASE_URL`                  | base locale de `docker compose` | **Obligatoire**, adresse de développement refusée ; jamais journalisée                                                                    |
| `DATABASE_POOL_MAX`             | `10`                            | 1 à 50                                                                                                                                    |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `10000`                         | 100 à 60 000                                                                                                                              |
| `RATE_LIMIT_PER_MINUTE`         | `120`                           | 10 à 10 000                                                                                                                               |
| `API_INTERNAL_KEY`              | aucune                          | Secret du serveur (32 à 128 caractères) ; jamais dans Git                                                                                 |
| `TOTP_ENCRYPTION_KEY`           | clé de dév. (local, démo)       | Secret : chiffrement des secrets de la double authentification (32 octets base64url, S6-T03) ; absente ailleurs = routes d'équipe fermées |
| `API_DOCS`                      | `true` (dév.)                   | `false` par défaut                                                                                                                        |
| `SMS_ENABLED`                   | `false`                         | `true` seulement quand un fournisseur SMS est branché (ADR-0015)                                                                          |
| `EMAIL_TRANSPORT`               | `console` (poste) / `none`      | `brevo` sur la démo ; `console` refusé hors du poste (ADR-0016)                                                                           |
| `MAILPIT_URL`                   | `http://localhost:8025`         | — (boîte de test locale ; interdite en production)                                                                                        |
| `BREVO_API_KEY`                 | aucune                          | **Secret** ; obligatoire avec `brevo`                                                                                                     |
| `EMAIL_FROM`, `EMAIL_FROM_NAME` | `no-reply@kemdia.local`, Kemdia | Avec `brevo` : adresse vérifiée dans Brevo (obligatoire)                                                                                  |

Une valeur invalide arrête l'API (code de sortie 1) avec la liste des variables en cause, **sans afficher leur valeur**.

### 3.5 Base de données (S3-T02)

Décision : [ADR-0008](adr/0008-postgresql-prisma.md) — guide pratique : [base-de-donnees.md](../guides/base-de-donnees.md).

```mermaid
flowchart LR
    subgraph api[apps/api]
      infra[infrastructure/ d'un module] --> ps[PrismaService<br/>adaptateur pg]
      health[/api/health/] --> dh[DatabaseHealth<br/>SELECT 1 ≤ 2 s]
      dh --> ps
    end
    ps -->|≤ 10 connexions<br/>requête ≤ 10 s| pg
    subgraph pg[(PostgreSQL 18 — base « kemdia »)]
      catalog[schéma catalog<br/>photos des vendeurs — S6-T04]
      identity[schéma identity — S4]
      auditdb[schéma audit — S4-T06<br/>ajout seul]
      ordersdb[schéma orders — S5<br/>paniers, commandes]
      paymentsdb[schéma payments — S5-T04<br/>paiements, remboursements]
      vendorsdb[schéma vendors — S6-T01<br/>boutiques]
      futurs[shipping<br/>S7]
      pub[public : suivi des migrations]
    end
```

| Règle                                                                                                | Vérifiée par                                   |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Un fichier Prisma par module ; chaque modèle dans le schéma PostgreSQL du module (`@@schema`)        | `test/prisma-schema.test.ts`                   |
| Aucune relation vers un autre module : on stocke un UUID                                             | `test/prisma-schema.test.ts`                   |
| Seule la couche `infrastructure/` d'un module utilise Prisma                                         | `test/architecture.test.ts`                    |
| Toute modification du schéma a sa migration                                                          | CI : `db:deploy` puis `db:check` sur base vide |
| Une migration fusionnée n'est jamais modifiée ; on en ajoute une nouvelle                            | Revue de code                                  |
| Une migration ne casse pas la version précédente de l'API (« ajouter d'abord, supprimer plus tard ») | Revue de code (retour arrière possible)        |

**Transaction partagée (S4-T06)** : `TransactionContext` (`src/database/transaction-context.ts`) ouvre une transaction et la rend visible
à tous les dépôts appelés pendant le travail (AsyncLocalStorage) ; un appel imbriqué rejoint la transaction en cours.
C'est ce qui permet d'écrire une action (schéma `identity`) et sa trace (schéma `audit`) ensemble ou pas du tout, sans relation entre modules.

**Environnements** : poste → `docker compose up -d db` (accessible seulement depuis le poste) ; CI → base éphémère par exécution ;
démo → **Neon Free** (PostgreSQL 18, Francfort, S3-T07) ; production → serveur (S7). En ligne, les migrations sont appliquées par **l'image de l'API**
(`node dist/database/migrate.js`) avant le démarrage de la nouvelle version (§3.8) ; sur le poste, `pnpm db:deploy` reste disponible.
**Exception de la démo** : sans commande avant déploiement sur Render gratuit, migrations et import de démonstration sont lancés au démarrage
du conteneur (`start-demo.js`, refusé hors `APP_ENV=demo`, [ADR-0013](adr/0013-demo-render-api-neon.md)).

### 3.6 Module `catalog` (S3-T03)

Décision : [ADR-0009](adr/0009-modele-catalogue.md). Premier module métier : il sert de modèle aux suivants.

```
src/modules/catalog/
├── index.ts                    Port public : CatalogModule, CatalogService et types (seule entrée pour les autres modules)
├── catalog.module.ts           Branche les ports sur les dépôts Prisma
├── domain/                     TypeScript pur, sans framework
│   ├── values.ts               UUID (BR-042), adresse, prix FCFA entiers (BR-004), stock, texte de recherche
│   ├── category.ts             Catégorie + CategoryTree (parents, boucles, 3 niveaux (BR-005), descendants, fil d'Ariane)
│   └── product.ts              Product + variantes (FR-013), prix « à partir de », checkOrderable (BR-001)
├── application/
│   ├── ports.ts                CategoryRepository, ProductRepository, critères, pages, compteurs
│   ├── product-search.ts       Validation des recherches (liste blanche, bornes : leçon MED-13)
│   └── catalog.service.ts      Lecture du catalogue + checkAvailability (API REST au S3-T04, orders au S5)
└── infrastructure/
    ├── prisma-*.repository.ts  SQL via Prisma ; produit + variantes enregistrés en une transaction
    └── demo-catalog.ts         Import des données de démonstration (UUID v5 stables, relançable)
```

```mermaid
erDiagram
    categories ||--o{ categories : "parent (3 niveaux max)"
    categories ||--o{ products : contient
    products ||--|{ product_variants : "1 à 50 variantes"
    categories {
      uuid id PK
      varchar slug UK
      uuid parent_id FK
    }
    products {
      uuid id PK
      varchar slug UK
      enum status "DRAFT, PUBLISHED, ARCHIVED"
      int price "variante active la moins chere"
      int compare_at_price
      text search_text "sans accents"
    }
    product_variants {
      uuid id PK
      varchar sku UK
      jsonb attributes "couleur, taille"
      int price "superieur a 0"
      int stock "jamais negatif"
    }
```

| Opération (`CatalogService`)      | Ce qu'elle fait                                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `getCategoryRoots`, `getCategory` | Arborescence (gardée 60 s en mémoire), fil d'Ariane, sous-catégories                                                    |
| `getProduct(slug)`                | Fiche produit avec variantes ; brouillons et archives → introuvable                                                     |
| `searchProducts(paramètres)`      | Catégorie **et sous-catégories**, mots sans accents, prix, marques, stock, promotion, note, 5 tris, pages de 48 au plus |
| `getFacets(paramètres, tranches)` | Compteurs des filtres, calculés avant application des filtres (comme le site)                                           |
| `checkAvailability(lignes)`       | BR-001 ligne par ligne : commandable, indisponible, variante inconnue, stock insuffisant (avec la quantité restante)    |

### 3.7 API REST `/api/v1` (S3-T04)

Décision : [ADR-0010](adr/0010-api-rest-openapi.md). Description complète : [`docs/api/openapi.json`](../api/openapi.json)
(OpenAPI 3.1, générée depuis les schémas Zod) ; page interactive `/api/docs` en développement.

| Route                                                                                    | Rôle                                                                                                                                            | Cache  | Limite                       |
| ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------- |
| `GET /api/v1/categories`                                                                 | Arborescence complète (3 niveaux)                                                                                                               | 60 s   | 120/min/IP                   |
| `GET /api/v1/categories/{slug}`                                                          | Catégorie, fil d'Ariane, sous-catégories ; 404 si inconnue                                                                                      | 60 s   | 120/min/IP                   |
| `GET /api/v1/products`                                                                   | Liste paginée : `category`, `q`, `sort`, `page`, `pageSize`, filtres, `scope=promotions`                                                        | 60 s   | 120/min/IP                   |
| `GET /api/v1/products/facets`                                                            | Compteurs des filtres (mêmes paramètres)                                                                                                        | 60 s   | 120/min/IP                   |
| `GET /api/v1/products/{slug}`                                                            | Fiche produit, variantes actives et leur stock ; 404 si brouillon ou archivé                                                                    | 60 s   | 120/min/IP                   |
| `POST /api/v1/availability`                                                              | BR-001 ligne par ligne (ne modifie rien)                                                                                                        | aucun  | 30/min/IP                    |
| `POST /api/v1/auth/signup`                                                               | Inscription : ticket + code ; **même réponse** si l'adresse a un compte (S4-T02)                                                                | aucun  | 10/min/IP                    |
| `POST /api/v1/auth/signup/verify`                                                        | Ticket + code → compte créé, déjà vérifié, **et session ouverte** (BR-041)                                                                      | aucun  | 10/min/IP                    |
| `POST /api/v1/auth/signup/resend`                                                        | Nouveau code (60 s entre deux, 5 par heure)                                                                                                     | aucun  | 10/min/IP                    |
| `POST /api/v1/auth/login`                                                                | Connexion ; 3 essais puis 15 min par identifiant, même réponse si l'adresse n'a pas de compte (S4-T03)                                          | aucun  | 10/min/IP                    |
| `GET /api/v1/auth/session`                                                               | Session présentée (`Authorization: Bearer`) valable ? La prolonge                                                                               | aucun  | 120/min/IP                   |
| `GET /api/v1/auth/2fa`, `POST …/setup\|enable\|verify\|recovery-codes`                   | Double authentification de l'équipe : QR code (mot de passe), activation, confirmation 15 min, codes de secours (S6-T03)                        | aucun  | 5 à 10/min/compte            |
| `POST /api/v1/auth/logout`, `/logout-all`                                                | Fermer cette session, ou toutes celles du compte                                                                                                | aucun  | 10/min/IP                    |
| `POST /api/v1/auth/password/forgot`                                                      | Mot de passe oublié : ticket + code ; **même réponse, aucun e-mail** sans compte (S4-T04)                                                       | aucun  | 10/min/IP                    |
| `POST /api/v1/auth/password/resend`                                                      | Nouveau code (60 s entre deux, 5 par heure)                                                                                                     | aucun  | 10/min/IP                    |
| `POST /api/v1/auth/password/reset`                                                       | Ticket + code + nouveau mot de passe → **connecté ici, déconnecté ailleurs**, blocage levé                                                      | aucun  | 10/min/IP                    |
| `POST /api/v1/auth/password/change`                                                      | Mot de passe actuel + nouveau → **reconnecté ici, déconnecté ailleurs** ; 3 erreurs : blocage 15 min et session fermée (S7-T07)                 | Bearer | 5/min/compte                 |
| `POST /api/v1/admin/accounts/lookup`                                                     | Retrouver un compte par e-mail ou téléphone (dans le corps) — **admin, connexion < 15 min** (S4-T06)                                            | aucun  | 30/min/IP                    |
| `PUT\|DELETE /api/v1/admin/accounts/{id}/roles/{role}`                                   | Accorder / retirer `vendor`, `catalog`, `logistics`, `finance` ou `support` (jamais `admin`, jamais sur soi) — admin, < 15 min                  | aucun  | 30/min/IP                    |
| `GET /api/v1/admin/audit`                                                                | Journal d'audit, du plus récent au plus ancien (curseur, filtres) — admin, < 15 min                                                             | aucun  | 30/min/IP                    |
| `GET\|DELETE /api/v1/cart`                                                               | Panier du compte connecté, **revérifié** (BR-001, prix BR-004) / le vider (S5-T01)                                                              | aucun  | 120/min/IP                   |
| `POST /api/v1/cart/items`                                                                | Ajouter une variante (quantités additionnées, ramenées au stock)                                                                                | aucun  | 120/min/IP                   |
| `PUT\|DELETE /api/v1/cart/items/{variantId}`                                             | Fixer la quantité d'une ligne / la retirer                                                                                                      | aucun  | 120/min/IP                   |
| `POST /api/v1/cart/merge`                                                                | Réunir le panier du navigateur après la connexion (additionner, `ignored`) ; 10/min par compte                                                  | aucun  | 120/min/IP                   |
| `POST /api/v1/orders/quote`                                                              | Total du panier pour une ville : frais, délai, paiement à la livraison possible ? (S5-T02)                                                      | aucun  | 120/min/IP                   |
| `POST /api/v1/orders`                                                                    | Commander le panier : stock réservé (BR-012), total comparé, idempotente ; 10/min par compte                                                    | aucun  | 120/min/IP                   |
| `GET /api/v1/orders`, `/orders/{reference}`                                              | Mes commandes (curseur), une commande et son historique                                                                                         | aucun  | 120/min/IP                   |
| `POST\|GET /api/v1/admin/coupons`, `PATCH …/{id}`                                        | Coupons : créer, lister, activer / désactiver — admin, < 15 min, journal d'audit (S5-T03)                                                       | aucun  | 30/min/IP                    |
| `POST /api/v1/orders/{reference}/cancel`                                                 | Annuler avant l'expédition (Mobile Money payée : service client) ; 10/min par compte                                                            | aucun  | 120/min/IP                   |
| `POST\|GET /api/v1/orders/{reference}/payments`                                          | Paiement Mobile Money : nouvel essai (3 au plus) / dernier essai (S5-T04) ; 10/min par compte                                                   | aucun  | 120/min/IP                   |
| `GET\|PUT /api/v1/admin/settings/cod`                                                    | Réglage du paiement à la livraison (zones, total maximum) — admin, < 15 min, journal (S5-T04)                                                   | aucun  | 30/min/IP                    |
| `POST /api/v1/admin/orders/{reference}/cancel`                                           | Annuler une commande, même payée (remboursement à faire) — admin, < 15 min, journal (S5-T04)                                                    | aucun  | 30/min/IP                    |
| `POST /api/v1/admin/orders/{reference}/cod-collected`                                    | Noter l'encaissement à la livraison (montant exact) — admin, < 15 min, journal (S5-T04)                                                         | aucun  | 30/min/IP                    |
| `POST /api/v1/webhooks/mobile-money`                                                     | Notification de l'opérateur : **signée** (HMAC-SHA256, 5 min), rejeu ignoré ; sans session (S5-T05)                                             | aucun  | 600/min/IP                   |
| `GET\|POST /api/v1/sandbox/mobile-money/requests[/{id}]`                                 | Téléphone simulé : demandes du compte, valider (PIN fictif) / refuser — local et démo seulement (S5-T05)                                        | aucun  | 120/min/IP                   |
| `GET /api/v1/orders/{reference}/invoices[/{numéro}]`                                     | Facture et avoir de la commande ; PDF à télécharger — son client seulement (S5-T06)                                                             | aucun  | 120/min/IP                   |
| `GET\|PUT /api/v1/admin/settings/billing`                                                | Informations de l'entreprise sur les factures — admin, < 15 min, journal (S5-T06)                                                               | aucun  | 30/min/IP                    |
| `GET /api/v1/admin/refunds`, `POST …/{id}/done`                                          | Remboursements à faire / noter fait avec la référence de l'opérateur — admin, < 15 min (S5-T04)                                                 | aucun  | 30/min/IP                    |
| `POST\|GET /api/v1/vendors/shop`                                                         | Demander à ouvrir sa boutique (ou redemander après un refus) ; suivre la décision — compte connecté (S6-T01)                                    | aucun  | 5/min/compte                 |
| `GET /api/v1/admin/shops[/{id}]`                                                         | Boutiques, demande la plus ancienne d'abord (filtre par statut) — admin, < 15 min (S6-T01)                                                      | aucun  | 30/min/IP                    |
| `POST\|GET /api/v1/vendors/products`, `GET\|PUT …/{id}`                                  | Produits de ma boutique : créer (en modération), lister, lire, modifier le contenu (repasse en modération) — vendeur à boutique active (S6-T02) | aucun  | 60/min/compte (écritures 20) |
| `PATCH /api/v1/vendors/products/{id}/variants/{vid}`, `POST …/archive\|restore`          | Prix, stock (avec le stock lu), activation sans modération ; archiver ; remettre en vente — vendeur (S6-T02)                                    | aucun  | 60/min/compte                |
| `GET /api/v1/moderation/products[/{id}]`, `POST …/approve\|reject`                       | File de modération ; valider ou refuser la version lue (`submittedAt`), motif — modérateur ou admin, < 15 min, journal (S6-T02)                 | aucun  | 30/min/IP                    |
| `POST\|PUT /api/v1/vendors/products/{id}/images`, `GET\|DELETE …/{imageId}`              | Photos de ma boutique : envoyer le fichier (JPEG, PNG, WebP, 5 Mo ; repasse en modération), ordre, aperçu, retrait — vendeur (S6-T04)           | aucun  | 60/min/compte (envois 20)    |
| `GET /api/v1/moderation/products/{id}/images/{imageId}`                                  | Photo d'un produit à modérer, quel que soit son statut — modérateur ou admin, 2FA (S6-T04)                                                      | aucun  | 120/min                      |
| `GET /api/v1/product-images/{imageId}/{large\|small}`                                    | Photo publique, seulement si le produit est visible ; relayée par le site sous `/images/v/…` (S6-T04)                                           | 60 s   | 300/min/IP                   |
| `POST /api/v1/admin/shops/{id}/approve\|reject\|suspend`                                 | Valider (rôle vendeur accordé), refuser ou suspendre (rôle retiré), motif montré — admin, < 15 min, journal (S6-T01)                            | aucun  | 30/min/IP                    |
| `GET /api/v1/orders/{n°}/shipment`                                                       | Livraison de SA commande : état, tentative, étapes — sans motif, transporteur ni parts (S7-T02)                                                 | aucun  | aucune                       |
| `GET /api/v1/shipping/tariffs`                                                           | Barème de livraison en vigueur des 4 zones (S7-T01)                                                                                             | aucun  | aucune                       |
| `GET\|PUT /api/v1/admin/shipping/tariffs`                                                | Régler le barème (frais de base, livraison offerte, délais) — admin, < 15 min, journal (S7-T01)                                                 | aucun  | 30/min/IP                    |
| `GET /api/v1/admin/shipping/ready`, `…/shipments?status=`, `…/shipments/{n°}`            | Commandes prêtes à expédier, expéditions par statut, une expédition et son historique — admin, < 15 min (S7-T01)                                | aucun  | 60/min/IP                    |
| `POST /api/v1/admin/shipping/shipments/{n°}/hand-over\|delivered\|failed\|retry\|cancel` | Remettre au transporteur, livrée, échec (motif), nouvelle tentative, annulation après échec (note) — admin, < 15 min, journal (S7-T01)          | aucun  | 60/min/IP                    |
| `GET /api/health`                                                                        | État de l'API et de la base                                                                                                                     | aucun  | aucune                       |
| `GET /api/v1/openapi.json`, `/api/docs`                                                  | Documentation (si `API_DOCS`, désactivée par défaut en production)                                                                              | 5 min  | aucune                       |

```mermaid
flowchart LR
    z[Schémas Zod<br/>packages/contracts] -->|valide les corps| r[Routes]
    z -->|z.toJSONSchema| o[OpenAPI 3.1<br/>/api/v1/openapi.json<br/>docs/api/openapi.json]
    z -->|valide chaque réponse| t[Tests de contrat<br/>en mémoire + vraie base]
    o --> ui[Page /api/docs<br/>servie par l'API, sans CDN]
    z -->|valide chaque réponse reçue| site[Site<br/>lib/catalog/api-catalog.ts]
```

**Contrat partagé (S3-T05)** : les schémas vivent dans le paquet `packages/contracts` (`@kemdia/contracts`), utilisé par l'API **et** le site.
`@kemdia/contracts/constants` (tris, badges, tranches de prix, limites) n'embarque pas Zod : la couche `application` de l'API peut l'utiliser
(le test d'architecture l'autorise, et interdit le reste du paquet au domaine et à l'application). `@kemdia/contracts/demo` contient les données
et les identifiants de démonstration (UUID v5). Le paquet est compilé à l'installation (`prepare`) et par Turborepo (`^build`).
Le paramètre `badge` (`featured`, `new`, `bestseller`) et le tri `ventes` ont été ajoutés pour l'accueil ; chaque produit de liste porte
sa **variante par défaut** (`variantId`, `stock`) et `variantCount` (contrat 1.1.0).

**Erreurs métier (S4-T02)** : champ `code` stable dans les Problem Details (`CODE_INVALIDE`, `CODE_EXPIRE`, `ENVOI_TROP_RAPPROCHE`…,
liste `IDENTITY_ERROR_CODES` du contrat) et en-tête `Retry-After` pour les limites ; contrat 1.2.0.
Connexion et sessions : contrat 1.3.0 (S4-T03) ; mot de passe oublié : contrat 1.4.0 (S4-T04) ;
rôles (`roles` dans `AccountView`), administration et journal : contrat 1.5.0 (S4-T06).

**Limitation de débit** (mise à jour au S4-T07, [ADR-0021](adr/0021-csrf-csp-limites.md)) — compteurs partagés par toutes les instances de l'API depuis S8-T07 (§3.38) :

| Qui appelle                                                       | Compté par                                                                            | Limites                                       |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| Un appelant direct                                                | Adresse (`req.ip`, `X-Forwarded-For` seulement derrière `TRUST_PROXY`) ; IPv6 par /64 | Celles du tableau ci-dessus                   |
| Le site **pour un visiteur** (clé interne + `X-Kemdia-Client-IP`) | Adresse du visiteur (illisible → compteur commun « inconnue »)                        | ×3 (CGNAT des opérateurs mobiles)             |
| Le site **sans visiteur** (lecture du catalogue)                  | —                                                                                     | Aucune (le site sert tout le monde)           |
| Toute route connectée (`SessionGuard`)                            | **Compte** et route                                                                   | 120/min ; « tous mes appareils » 5 ; admin 30 |

Dépassement : 429, code `TROP_DE_REQUETES`, en-tête `Retry-After`. Contrat 1.6.0.

**Panier (S5-T01)** : codes `PANIER_PLEIN`, `PRODUIT_INDISPONIBLE`, `VARIANTE_INCONNUE`, `PANIER_OCCUPE` (liste `CART_ERROR_CODES` ; `API_ERROR_CODES` = identité + panier),
limites `CART_MAX_LINES` (50), `CART_MAX_QUANTITY` (20), `CART_TTL_DAYS` (90). Contrat 1.7.0.

**Commandes (S5-T02)** : `ORDER_ERROR_CODES` (`PANIER_VIDE`, `PANIER_A_VERIFIER`, `PRIX_MODIFIE`, `ADRESSE_INVALIDE`, `NUMERO_PAIEMENT_INVALIDE`,
`PAIEMENT_A_LA_LIVRAISON_INDISPONIBLE`, `COMMANDE_INTROUVABLE`, `ANNULATION_IMPOSSIBLE`, `CLE_DEJA_UTILISEE`, `TROP_DE_COMMANDES_OUVERTES`), statuts, moyens de paiement,
`PAYMENT_WINDOW_MINUTES` (30), `MAX_OPEN_ORDERS` (3) ; barèmes de livraison dans `@kemdia/contracts/delivery` (gelés). Contrat 1.8.0.

**Coupons (S5-T03)** : `couponCode` dans le devis et la commande ; `COUPON_ERROR_CODES` (`COUPON_INVALIDE`, `COUPON_EXPIRE`, `COUPON_EPUISE`, `COUPON_DEJA_UTILISE`,
`COUPON_MINIMUM_NON_ATTEINT`, `COUPON_NON_APPLICABLE`, `COUPON_EXISTE`, `COUPON_INTROUVABLE`, `COUPON_TROP_D_ESSAIS`), `COUPON_LIMITS`. Contrat 1.9.0.

**Site branché (S5-T07, [ADR-0029](adr/0029-site-tunnel-commande-mes-commandes.md))** : `mobileMoney.allowed` dans le devis
(`OrderQuote`), code `MOBILE_MONEY_INDISPONIBLE` (422) quand une commande Mobile Money est demandée sans fournisseur. Contrat 1.13.0.

**Boutiques (S6-T01, [ADR-0032](adr/0032-boutiques-vendeurs.md))** : schémas `Shop`, `AdminShop`, `AdminShopPage`,
`ShopApplicationRequest`, `ShopDecisionReason` ; `SHOP_STATUSES`, `SHOP_KINDS`, `SHOP_LIMITS`, `KEMDIA_SHOP_ID` ; codes
`VENDOR_ERROR_CODES` (`BOUTIQUE_INVALIDE`, `BOUTIQUE_EXISTE`, `NOM_BOUTIQUE_PRIS`, `BOUTIQUE_INTROUVABLE`,
`STATUT_BOUTIQUE_INCOMPATIBLE`, `BOUTIQUE_SUR_SOI_INTERDITE`, `PROPRIETAIRE_INACTIF`, `BOUTIQUE_OCCUPEE`) ; cible `shop` au journal.
Contrat 1.14.0.

**Produits des vendeurs et modération (S6-T02, [ADR-0033](adr/0033-produits-vendeurs-moderation.md))** : schémas
`VendorProduct*`, `VendorVariant*`, `ModerationProduct*`, `ProductApproval`, `ProductModerationReason` ; `VENDOR_PRODUCT_STATUSES`,
`VENDOR_PRODUCT_LIMITS`, `MAX_PENDING_PRODUCTS_PER_SHOP` ; codes `BOUTIQUE_INACTIVE`, `PRODUIT_INVALIDE`, `CATEGORIE_INCONNUE`,
`PRODUIT_INTROUVABLE`, `VARIANTE_INTROUVABLE`, `STATUT_PRODUIT_INCOMPATIBLE`, `PRODUIT_SUR_SOI_INTERDIT`, `STOCK_MODIFIE`,
`PRODUIT_MODIFIE`, `TROP_DE_PRODUITS_EN_ATTENTE` ; cible `product` au journal. Contrat 1.15.0.

**Photos des produits des vendeurs (S6-T04, [ADR-0035](adr/0035-photos-produits-vendeurs.md))** : schémas
`ProductImageOrderRequest`, `ProductImageParams`, `PublicProductImageParams` ; `PRODUCT_IMAGE_TYPES`, `PRODUCT_IMAGE_LIMITS`,
`VENDOR_IMAGE_PATH_PATTERN` ; codes `FORMAT_IMAGE_INVALIDE` (415), `IMAGE_TROP_GRANDE` (413), `IMAGE_TROP_PETITE` (422),
`TROP_DE_PHOTOS` (409), `PHOTO_INTROUVABLE` (404). Contrat 1.17.0 (1.16.0 : double authentification).

### 3.8 Image Docker de l'API (S3-T06)

Décision : [ADR-0012](adr/0012-image-api-migrations.md). Fichier : `apps/api/Dockerfile` (construit depuis la racine du dépôt).

```mermaid
flowchart LR
    subgraph build[Construction — une fois par commit]
      i[pnpm install<br/>API + contrat] --> b[contrat · client Prisma · tsc]
      b --> d[pnpm deploy --prod<br/>dépendances de production]
      d --> e[moteur de migrations<br/>Alpine, téléchargé ici]
    end
    e --> img[(Image ghcr.io/…/kemdia/api<br/>sha-commit)]
    img -->|1. tâche ponctuelle| m[node dist/database/migrate.js<br/>prisma migrate deploy]
    m -->|code 0| a[2. node dist/main.js<br/>API]
    m -. échec .-> stop[la nouvelle API ne démarre pas]
    m --> pg[(PostgreSQL)]
    a --> pg
```

| Élément       | Valeur                                                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Base          | `node:22-alpine` mis à jour, sans npm ni corepack                                                                                 |
| Contenu       | `dist/`, dépendances de production, `prisma/schema`, `prisma/migrations`, `prisma.config.ts`, moteur `/app/engines/schema-engine` |
| Exécution     | Utilisateur `kemdia` (1001), fichiers en lecture seule, port 4000, `HEALTHCHECK` sur `/api/health` (base comprise)                |
| Variables     | Celles de l'API (`apps/api/.env.example`) ; l'image fixe `NODE_ENV=production`, `APP_ENV=production` et `APP_VERSION` (sha)       |
| Migrations    | Même image, même configuration ; vérifiée comme au démarrage de l'API ; ne fait rien si la base est à jour ; verrou PostgreSQL    |
| Local         | `docker compose up --build` : `db` → `api-migrate` → `api` (port 4000) → `web` (lit l'API si `API_INTERNAL_KEY` est dans `.env`)  |
| Démo (S3-T07) | `node dist/database/start-demo.js` : migrations → import de démonstration (`demo-import.js`) → API. Refusé si `APP_ENV` ≠ `demo`  |

### 3.9 Module `identity` (S4-T01)

Décision : [ADR-0015](adr/0015-identite-sessions-otp.md). Même organisation que `catalog` (§3.6) ; les routes arrivent au S4-T02 et S4-T03.

```
src/modules/identity/
├── index.ts                         Port public : IdentityModule, SessionGuard, @CurrentSession, SessionService, IdentityError
├── identity.module.ts               Branche les ports ; choisit l'envoi des codes selon l'environnement
├── domain/                          TypeScript pur
│   ├── identifier.ts                E-mail ou mobile gabonais normalisé (+2410[67]…), masquage (FR-004)
│   ├── password-policy.ts           8 à 128 caractères, lettre + chiffre, mots de passe courants ; prénom et nom
│   ├── account.ts                   Compte (créé vérifié, BR-041), vue du titulaire
│   ├── login-guard.ts               BR-040 par identifiant : 3 essais en 15 min puis 15 min de blocage (S4-T03)
│   ├── session.ts                   Session : 30 jours glissants, prolongée au plus une fois par heure (S4-T03)
│   ├── otp.ts                       Code à 6 chiffres : empreinte seulement, 10 min, 5 essais, temps constant
│   ├── role.ts                      Rôles cumulables, hiérarchie, qui peut accorder quoi (CRIT-06), connexion < 15 min (S4-T06)
│   ├── signup-ticket.ts             Ticket d'inscription : 32 octets, empreinte SHA-256, 24 h (S4-T02)
│   └── reset-ticket.ts              Ticket de mot de passe oublié : 32 octets, empreinte SHA-256, 1 h (S4-T04)
├── application/
│   ├── ports.ts                     Dépôts (comptes, codes, tickets), PasswordHasher, OtpSender, Clock
│   ├── otp.service.ts               Envoi (60 s entre deux, 5 par heure, SMS seulement si SMS_ENABLED) : code, alerte ou rien ; vérification
│   ├── signup.service.ts            Inscription sans énumération (leurre + alerte) ; compte créé au bon code ; renvoi (S4-T02, ADR-0016)
│   ├── login.service.ts             Connexion sans énumération : essai réservé avant vérification, hachage factice (S4-T03)
│   ├── session.service.ts           Ouvrir, vérifier, prolonger, fermer une session ; « tous mes appareils » (S4-T03)
│   ├── password-reset.service.ts    Mot de passe oublié sans énumération (leurre, aucun e-mail) ; changement en une transaction (S4-T04, ADR-0018)
│   └── role.service.ts              Accorder / retirer un rôle + ligne d'audit en une transaction ; commande serveur `admin` (S4-T06)
├── interface/
│   ├── identity.controller.ts       /auth/signup…, /login, /session, /logout, /logout-all, /password/forgot, /resend, /reset
│   ├── session.guard.ts             SessionGuard (jeton `Authorization: Bearer`) pour toutes les routes protégées
│   ├── role.guard.ts                @Authorize(rôle, { recentLogin }) = SessionGuard + RoleGuard, fermée par défaut (S4-T06)
│   ├── admin.controller.ts          /admin/accounts/lookup, /admin/accounts/{id}/roles/{role}, /admin/audit (S4-T06)
│   └── identity-http-errors.ts      Erreur métier → statut HTTP + code + Retry-After
└── infrastructure/
    ├── argon2-password-hasher.ts    Argon2id (19 Mio, 2 passes)
    ├── otp-sender.factory.ts        EMAIL_TRANSPORT : console (poste), Mailpit, Brevo, ou aucun envoi
    ├── email/                       Modèles d'e-mails (FR, sans lien) ; API web de Mailpit et de Brevo (délai 10 s)
    ├── identity-maintenance.ts      Ménage horaire : sessions, codes, tickets et compteurs périmés
    ├── prisma-role.repository.ts    Rôles : statut du compte relu sous verrou (FOR SHARE), ajout sans doublon (S4-T06)
    └── prisma-*.repository.ts       Comptes (avec leurs rôles), codes, tickets, sessions ; essais de connexion en une requête atomique
```

Tables du schéma `identity` :

| Table            | Contenu                                                                                                                                                                                         | Contraintes SQL ajoutées à la main                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `accounts`       | Prénom, nom, e-mail et/ou téléphone (uniques), hachage Argon2id, version du mot de passe, statut, vérifications ; `failed_logins` / `locked_until` supprimées au S5-T01 (étape 2 de l'ADR-0022) | Au moins un identifiant ; e-mail en minuscules ; téléphone `+2410[67]` ; actif ⇒ vérifié          |
| `otp_challenges` | Usage (inscription / oubli), canal, destination, **empreinte** du code, essais, expiration                                                                                                      | Empreinte hexadécimale de 64 caractères ; 0 à 5 essais                                            |
| `sessions`       | Compte, **empreinte** du jeton (unique), expiration, dernière activité, révocation, version du mot de passe                                                                                     | Empreinte hexadécimale ; suppression en cascade avec le compte                                    |
| `reset_tickets`  | **Empreinte** du ticket, destination, compte (vide = leurre), expiration (S4-T04)                                                                                                               | Empreinte hexadécimale ; expiration après création ; suppression en cascade avec le compte        |
| `login_guards`   | Identifiant (compte ou pas), essais, fin du blocage, dernière tentative (S4-T03)                                                                                                                | Essais ≥ 0 ; écrit seulement par `INSERT … ON CONFLICT DO UPDATE`                                 |
| `signup_tickets` | **Empreinte** du ticket, destination, inscription (prénom, nom, hachage ; vide = leurre), expiration (S4-T02)                                                                                   | Empreinte hexadécimale ; inscription complète ou vide ; une seule par destination                 |
| `account_roles`  | Compte, rôle (`VENDOR`, `CATALOG` — ex-`MODERATOR` —, `LOGISTICS`, `FINANCE`, `SUPPORT`, `ADMIN`), date, administrateur qui l'a accordé (vide = commande serveur) (S4-T06)                      | Un rôle par ligne (clé compte + rôle) ; jamais accordé par son titulaire ; cascade avec le compte |

**Rôles (S4-T06, [ADR-0020](adr/0020-roles-journal-audit.md) ; détaillés au S7.5-T04, §3.25)** : `client` (tout compte actif, jamais stocké), `vendor`, `catalog`, `logistics`, `finance`, `support`, `admin`,
cumulables ; `admin` a les droits de tous les rôles de l'équipe. Un administrateur accorde ou retire `vendor` et les rôles de l'équipe à un autre compte ; `admin`
s'accorde seulement par la commande serveur :

```bash
pnpm --filter @kemdia/api admin:grant  awa@exemple.ga   # le compte doit être inscrit et vérifié
pnpm --filter @kemdia/api admin:revoke awa@exemple.ga
# image Docker : node dist/cli/admin-role.js grant awa@exemple.ga
```

Les rôles sont lus avec le compte à chaque requête : un rôle retiré ne sert plus, tout de suite.

### 3.10 Module `audit` (S4-T06)

Décision : [ADR-0020](adr/0020-roles-journal-audit.md).

```
src/modules/audit/
├── index.ts                         Port public : AuditModule, AuditLog (écrire), AuditReader (lire), auditContextOf(req)
├── domain/audit-event.ts            Actions (liste fermée), acteur, cible, détails courts sans caractère de contrôle ; 365 jours
├── application/audit-log.ts         Écrire (dans la transaction de l'action) ; lire par pages de 100 au plus
├── infrastructure/
│   ├── prisma-audit.repository.ts   Écriture via TransactionContext ; lecture par curseur (date, id) ; purge par lots
│   └── audit-retention.ts           Purge toutes les 6 h des lignes de plus de 365 jours
└── interface/request-context.ts     Adresse IP vue par l'API, identifiant de requête
```

| Action                                    | Écrite par                         | Détails                                              |
| ----------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| `role.granted`                            | Administrateur ou commande serveur | `role`, `source`                                     |
| `role.revoked`                            | Administrateur ou commande serveur | `role`, `source`                                     |
| `password.reset`                          | Titulaire (mot de passe oublié)    | —                                                    |
| `sessions.revoked_all`                    | Titulaire (« tous mes appareils ») | `count` (si ≥ 1)                                     |
| `coupon.created`                          | Administrateur (S5-T03)            | `code`, `kind`, `value`                              |
| `coupon.updated`                          | Administrateur (S5-T03)            | `code`, `active`                                     |
| `order.cancelled_by_admin`                | Administrateur (S5-T04)            | `reference`, `previousStatus`, `refunds`, `note`     |
| `refund.done`                             | Administrateur (S5-T04)            | `reference`, `amount`, `externalReference`           |
| `cod.collected`                           | Administrateur (S5-T04)            | `reference`, `amount`                                |
| `settings.billing_updated`                | Administrateur (S5-T06)            | `legalName`, `taxId`                                 |
| `settings.cod_updated`                    | Administrateur (S5-T04)            | `zones`, `maxTotal`                                  |
| `mfa.enabled`, `mfa.recovery_regenerated` | Titulaire (S6-T03)                 | —                                                    |
| `mfa.recovery_used`                       | Titulaire (S6-T03)                 | `remaining`                                          |
| `mfa.failed`                              | Titulaire (S6-T03)                 | `attempts`, `today`                                  |
| `mfa.locked`                              | Titulaire (S6-T03)                 | `attempts`, `scope` (15min ou 24h), `sessionsClosed` |
| `mfa.reset`                               | Serveur (S6-T03)                   | `source`, `sessionsClosed`, `password`               |
| `shop.requested`                          | Demandeur (S6-T01)                 | `name`, `previousName` (nouvelle demande)            |
| `shop.approved`                           | Administrateur (S6-T01)            | `name`, `from`, `to` (+ `role.granted`)              |
| `shop.rejected`                           | Administrateur (S6-T01)            | `name`, `from`, `to`, `reason` (100 caractères)      |
| `product.submitted`                       | Vendeur (S6-T02)                   | `title`, `reason`, `from` (+ `image`, `sha256`)      |
| `product.approved`                        | Modérateur (S6-T02)                | `title`, `from`, `to`                                |
| `product.rejected`                        | Modérateur (S6-T02)                | `title`, `from`, `to`, `reason`                      |
| `product.archived`                        | Vendeur (S6-T02)                   | `title`, `from`                                      |
| `product.variant_updated`                 | Vendeur (S6-T02)                   | `sku`, prix / prix barré / stock avant et après      |
| `product.image_removed`                   | Vendeur (S6-T04)                   | `title`, `image`, `sha256`                           |
| `product.images_reordered`                | Vendeur (S6-T04)                   | `title`                                              |
| `shop.suspended`                          | Administrateur (S6-T01)            | `name`, `from`, `to`, `reason` (+ `role.revoked`)    |

Table `audit.events` : identifiant, date (**posée par la base**), action, type et UUID de l'acteur, type et UUID de la cible, détails (JSON ≤ 2 Ko),
adresse IP, identifiant de requête. Déclencheurs SQL : **aucune modification**, suppression seulement après 365 jours, `TRUNCATE` interdit.
Pas de clé étrangère vers les comptes : la trace survit au compte.

### 3.11 Module `orders` — panier serveur (S5-T01)

Décision : [ADR-0023](adr/0023-panier-serveur.md). Commandes et réservation du stock au S5-T02.

```
src/modules/orders/
├── index.ts                         Port public : OrdersModule, CartService, OrdersError
├── orders.module.ts                 Branche les ports ; lit le catalogue par CatalogService (port public)
├── domain/
│   ├── cart.ts                      Panier : variantes + quantités, 50 lignes, 1 à 20, borné au stock, réunion « additionner »
│   └── orders-error.ts              PANIER_PLEIN, PRODUIT_INDISPONIBLE, VARIANTE_INCONNUE, PANIER_OCCUPE
├── application/
│   ├── ports.ts                     CartRepository (lecture, modification sous verrou, ménage), CartCatalog
│   └── cart.service.ts              Lire (revérifié), ajouter, fixer, retirer, vider, réunir ; UUID en minuscules
├── infrastructure/
│   ├── prisma-cart.repository.ts    Verrou par INSERT … ON CONFLICT DO UPDATE (attente ≤ 1 s), réunion idempotente, écrit ce qui change
│   └── cart-cleanup.ts              Ménage horaire : paniers sans activité depuis 90 jours
└── interface/
    ├── cart.controller.ts           /cart, /cart/items, /cart/items/{variantId}, /cart/merge (SessionGuard)
    ├── cart.openapi.ts              Documentation OpenAPI
    └── orders-http-errors.ts        Erreur métier → statut HTTP + code
```

| Table        | Contenu                                                                                                                                | Contraintes SQL ajoutées à la main                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `carts`      | Compte (UUID, **unique**, sans clé étrangère entre modules), dernière réunion appliquée (`last_merge_id`), création, dernière activité | Index sur la dernière activité (ménage)                                                  |
| `cart_items` | Panier, variante (UUID du catalogue), quantité, date d'ajout — **jamais de prix**                                                      | Quantité de 1 à 20 ; déclencheur : 50 lignes au plus par panier ; cascade avec le panier |

Chaque réponse est calculée à partir du catalogue **au moment de la lecture** : prix actuel, `ok` / `reason` / `available` par ligne
(BR-001), total des seules lignes commandables, `ok` global (passage en caisse possible). Une variante supprimée du catalogue est retirée
du panier. Le panier ne réserve pas le stock (BR-012, à la commande).

### 3.12 Commandes (S5-T02)

Décision : [ADR-0024](adr/0024-commandes-reservation-stock.md). Fichiers ajoutés au module `orders` :

```
orders/
├── domain/order.ts                    Statuts et transitions (BR-010), annulation par le client, numéro KMD-XXXXXX, paiement, montants
├── domain/delivery-address.ts         Adresse (nom, mobile, ville, quartier, repère), Unicode normalisé
├── application/order.service.ts       Devis, création (une transaction), lecture, annulation, paiements non reçus
├── infrastructure/prisma-order.repository.ts   Panier verrouillé, commande + lignes + historique, curseur, SKIP LOCKED
├── infrastructure/orders-transaction.ts        Verrous 3 s, connexion 3 s, transaction 10 s → PANIER_OCCUPE
├── infrastructure/overdue-orders.ts            Toutes les minutes : commandes non payées en 30 min annulées, stock remis
└── interface/order.controller.ts      /orders/quote, /orders, /orders/{reference}, /orders/{reference}/cancel
catalog/
├── application/stock.service.ts       Port public : réserver (tout ou rien) / remettre le stock
└── infrastructure/prisma-stock.repository.ts   UPDATE … stock − q WHERE stock ≥ q, dans la transaction de la commande
```

| Table                  | Contenu                                                                                                                 | Règles SQL ajoutées à la main                                                                                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orders`               | Numéro, compte, clé et empreinte d'idempotence, statut, paiement, montants, adresse copiée, délai, échéance, annulation | Montants (total = articles + livraison), formats, cohérence statut / échéance / annulation ; déclencheur : champs figés, statuts dans l'ordre prévu, échéance jamais repoussée ; ni suppression ni `TRUNCATE` |
| `order_items`          | Copie figée de chaque article (titre, variante, image, prix unitaire, quantité, total de ligne)                         | Quantité 1 à 20, total de ligne exact ; ajout seul                                                                                                                                                            |
| `order_status_history` | Chaque statut et sa date (suivi de commande)                                                                            | Ajout seul                                                                                                                                                                                                    |

Une commande se crée **à partir du panier du compte** : la requête ne porte que l'adresse, le moyen de paiement, la clé d'idempotence et le
total affiché. Stock réservé, montants calculés, commande enregistrée et panier vidé dans **une seule transaction**.

**Mobile Money selon le fournisseur (S5-T07, ADR-0029)** : `config/mobile-money.ts` dit si un paiement Mobile Money peut aboutir
(aujourd'hui : opérateur simulé, poste de développement et démo). Le module `orders` le lit par le port `MOBILE_MONEY` : le devis
l'indique (`mobileMoney.allowed`) et la création refuse une commande Mobile Money sans fournisseur (`MOBILE_MONEY_INDISPONIBLE`),
**après** la recherche de la clé d'idempotence (une commande déjà créée est toujours rendue) et avant toute réservation de stock.

### 3.13 Coupons (S5-T03)

Décision : [ADR-0025](adr/0025-coupons.md). Fichiers ajoutés au module `orders` : `domain/coupon.ts` (règles, réduction, BR-030 / BR-031),
`application/coupon.service.ts` (administration + journal d'audit), `infrastructure/prisma-coupon.repository.ts`, `interface/coupon.controller.ts`.

| Table                | Contenu                                                                                                 | Règles SQL ajoutées à la main                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `coupons`            | Code (majuscules), type, valeur, plafond, minimum, dates, limites, compteur, cumulable, actif, créateur | Valeurs et limites cohérentes, compteur ≤ limite ; règles figées (seuls activation et compteur changent) ; ni suppression ni `TRUNCATE`             |
| `coupon_redemptions` | Coupon, commande (une au plus), compte, montant, date, remise                                           | Montant > 0 ; seule la remise peut être posée, une fois ; rien ne s'efface                                                                          |
| `orders` (colonnes)  | `discount`, `coupon_code`                                                                               | total = articles − réduction + livraison, total > 0, réduction < articles, réduction ⇔ code ; figés ; annulation → utilisation rendue (déclencheur) |

Dans la transaction de la commande, l'ordre des verrous est toujours **panier → variantes → coupon** (annulation : commande → variantes → coupon).

**Code promo de démonstration (S5-T08, [ADR-0030](adr/0030-demo-premier-achat-ci-allegee.md))** : `DEMO10` (10 %, 10 000 FCFA au plus,
une fois par compte), constante `DEMO_COUPON` du contrat, créé par l'import de démonstration (`orders/infrastructure/demo-coupon.ts`)
seulement sur la démo, ou sur le poste de développement avec une base locale (`demoCouponAllowed`). Jamais modifié s'il existe.

### 3.14 Paiements (S5-T04)

Décision : [ADR-0026](adr/0026-paiements.md). Nouveau module `payments` (`domain/payment.ts` : essais, délais, comptage ;
`application/payment.service.ts` : essais et résultat du fournisseur ; `application/payment-admin.service.ts` : service client ;
`infrastructure/payment-providers.ts` : fournisseur simulé ou aucun ; `infrastructure/stale-payments.ts` : expiration).
Ajouts au module `orders` : `OrderPayments` (port pour `payments`), réglage du paiement à la livraison (`cod-settings.*`).

```mermaid
stateDiagram-v2
    [*] --> en_attente : essai (3 au plus)
    en_attente --> réussi : argent reçu
    en_attente --> échoué : refus de l'opérateur
    en_attente --> expiré : 3 min sans réponse
    échoué --> réussi : argent reçu en retard
    expiré --> réussi : argent reçu en retard
    réussi --> [*] : commande confirmée et payée,<br/>ou remboursement « à faire »
```

| Table                     | Contenu                                                                                                  | Règles SQL ajoutées à la main                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `payments.payments`       | Commande, compte, moyen, montant, numéro, statut, n° d'essai, fournisseur et sa référence, raison, délai | Montant > 0, numéro +2410[67]…, espèces = réussi et noté par un admin ; statuts dans l'ordre ; champs figés ; rien ne s'efface  |
| `payments.refunds`        | Paiement (un au plus), commande et son numéro, montant, numéro, raison, à faire / fait, référence        | Lié à un paiement reçu (même commande, même numéro) ; « fait » ⇔ référence (unique) + admin + date, une fois ; rien ne s'efface |
| `orders.cod_settings`     | Une ligne : zones, total maximum, dernier admin                                                          | Une seule ligne, zones connues, total entre 0 et 10 000 000 ; ne s'efface pas                                                   |
| `orders.orders` (colonne) | `paid_at` (payée)                                                                                        | Posée une fois, jamais sur une commande annulée ; la commande payée ne s'annule plus en ligne                                   |

Fournisseur : simulé sur le poste de développement et la démo, **aucun** en préproduction et production (`PAIEMENT_INDISPONIBLE`)
tant que la question ouverte n° 7 n'est pas tranchée.

**Notifications signées et opérateur simulé (S5-T05, [ADR-0027](adr/0027-notifications-signees-bac-a-sable.md))** : l'opérateur
prévient Kemdia par `POST /api/v1/webhooks/mobile-money`. Signature HMAC-SHA256 sur `<t>.<corps brut>` (en-tête
`x-kemdia-signature`), vérifiée avant de lire le contenu, fenêtre de 5 minutes ; chaque notification est inscrite dans
`payments.provider_events` (clé = son identifiant, ajout seul) dans la transaction qui applique le résultat : un rejeu ne change
rien. L'**opérateur simulé** (`infrastructure/sandbox-operator.ts`, local et démo seulement, clé tirée au démarrage) reçoit les
demandes, les montre sur le téléphone simulé du site et envoie la notification signée **par HTTP** à l'API, comme le vrai.

**Annulation par le client (S5-T07, ADR-0029)** : le module `orders` tient un registre `OrderCancelHooks` ; le module `payments`
s'y inscrit au démarrage (`PaymentService.onModuleInit`). Dans la transaction de l'annulation, les essais encore en attente passent
« expiré » (`commande_annulee`) et le fournisseur peut retirer la demande (`PaymentProvider.cancel`, facultatif : l'opérateur simulé
l'enlève du téléphone). Un paiement validé malgré tout donne un remboursement « à faire » (inchangé).

### 3.15 Factures (S5-T06)

Décision : [ADR-0028](adr/0028-factures.md). Ajouts au module `payments` : `domain/invoice.ts` (numéros, année du Gabon,
montants), `application/invoice.service.ts` (émission, avoir, rattrapage, e-mails), `application/billing-settings.service.ts`,
`infrastructure/invoice-pdf.ts` (pdf-lib), `infrastructure/invoice-mailer.ts`, `infrastructure/invoice-emails.ts` (tâche chaque
minute). Transports d'e-mail partagés dans `src/mail/` ; contact du client par `AccountDirectory` (module identity).

```mermaid
flowchart LR
    pay[Paiement reçu<br/>Mobile Money ou espèces] -->|même transaction| inv[Facture KMD-F-AAAA-NNNNNN<br/>copie figée]
    cancel[Annulation admin<br/>commande facturée] -->|même transaction| cn[Avoir KMD-A-AAAA-NNNNNN]
    inv --> job[Tâche chaque minute]
    cn --> job
    job -->|PDF joint, 5 essais espacés| mail[(E-mail vérifié)]
    inv -->|GET …/invoices/numéro| pdf[PDF refait à l'identique]
```

| Table                       | Contenu                                                                                     | Règles SQL ajoutées à la main                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payments.invoices`         | Numéro, type, commande, compte, avoir → facture, montants, copies (JSONB), paiement, e-mail | Format du numéro selon le type, montants cohérents ; figée (sauf suivi de l'e-mail, qui n'avance que) ; avoir = facture de la même commande, même montant ; rien ne s'efface |
| `payments.invoice_counters` | Dernier numéro par type et par année                                                        | N'avance que d'un ; ne s'efface pas                                                                                                                                          |
| `payments.billing_settings` | Une ligne : raison sociale, adresse, NIF, RCCM, mention de TVA                              | Une seule ligne, valeurs de départ « à compléter » ; ne s'efface pas                                                                                                         |

En préproduction et en production, aucune facture n'est émise tant qu'un administrateur n'a pas renseigné l'entreprise : le paiement
passe, la facture est établie par le rattrapage dès que c'est fait.

### 3.16 Module `vendors` — boutiques (S6-T01)

Décision : [ADR-0032](adr/0032-boutiques-vendeurs.md). Fichiers : `domain/shop.ts` (nettoyage et vérification de la demande, clé
d'unicité du nom, cycle de vie, décisions), `application/shop.service.ts` (demande, examen, rôle vendeur), `infrastructure/`
(dépôt Prisma, transaction avec délai de verrou), `interface/` (routes du demandeur et de l'administration, OpenAPI).

```mermaid
stateDiagram-v2
    [*] --> pending : demande (compte connecté)
    pending --> active : valider (rôle vendeur accordé)
    pending --> rejected : refuser (motif)
    rejected --> pending : nouvelle demande
    active --> suspended : suspendre (motif, rôle retiré)
    suspended --> active : réactiver (rôle accordé)
```

| Table / colonne            | Contenu                                                                                                                  | Règles SQL ajoutées à la main                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vendors.shops`            | Type (Kemdia / vendeur), propriétaire, nom et sa clé, adresse lisible, ville, mobile, description, statut, motif, examen | Boutique Kemdia = identifiant imposé (donc une seule), sans propriétaire, active ; clé du nom vide ⇔ refusée (nom libéré) ; vendeur : propriétaire et mobile gabonais ; longueurs ; motif ⇔ refus ou suspension ; examinateur ≠ propriétaire ; uniques : propriétaire, clé du nom, adresse |
| `catalog.products.shop_id` | Boutique qui vend le produit (UUID)                                                                                      | Valeur par défaut : la boutique Kemdia (`KEMDIA_SHOP_ID`) ; index                                                                                                                                                                                                                          |

La boutique, le rôle vendeur et la ligne du journal changent **dans la même transaction**. Les tâches suivantes du S6 (produits des
vendeurs, commandes vendeur) vérifieront **le rôle et une boutique active**, car un administrateur peut encore changer le rôle par
les routes des rôles (S4-T06).

### 3.17 Produits des vendeurs et modération (S6-T02)

Décision : [ADR-0033](adr/0033-produits-vendeurs-moderation.md). Le **catalogue** garde les produits et leurs états
(`domain/vendor-product.ts`, `application/vendor-catalog.service.ts` exporté comme `VendorCatalog`,
`infrastructure/prisma-vendor-product.repository.ts`) sans décider d'aucun droit ; le module **`vendors`** vérifie les droits,
écrit le journal et porte les routes (`vendor-product.service.ts`, `product-moderation.service.ts`, deux contrôleurs).

```mermaid
stateDiagram-v2
    [*] --> PENDING : création (vendeur, boutique active)
    PENDING --> PUBLISHED : valider (version lue)
    PENDING --> REJECTED : refuser (motif)
    PUBLISHED --> PENDING : titre, description, marque ou catégorie modifiés
    REJECTED --> PENDING : contenu modifié
    PUBLISHED --> ARCHIVED : archiver
    PENDING --> ARCHIVED : archiver
    REJECTED --> ARCHIVED : archiver
    ARCHIVED --> PENDING : remettre en vente
```

**Visible des clients** = `PUBLISHED` ET boutique non suspendue (`Product.isVisible`) : fiche, listes et filtres, panier,
disponibilité, réservation du stock. Prix, prix barré, stock et activation d'une variante changent sans modération (tracés au
journal) ; le stock se change avec la valeur lue (`previousStock`), sinon `STOCK_MODIFIE`.

| Colonne de `catalog.products` | Contenu                            | Règles SQL ajoutées à la main                                       |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------- |
| `status`                      | + `PENDING`, `REJECTED`            | Migration à part (valeurs d'énumération)                            |
| `shop_suspended`              | Boutique suspendue : produit caché | Jamais pour la boutique Kemdia                                      |
| `submitted_at`                | Dernier envoi en modération        | Obligatoire en attente                                              |
| `moderation_reason`           | Motif du refus                     | Présent ⇔ refusé ; 5 à 300 caractères                               |
| `reviewed_by`, `reviewed_at`  | Dernière décision                  | Ensemble ; jamais pour un produit Kemdia (ni en attente, ni refusé) |

Ordre des verrous (pas d'interblocage) : vendeur boutique (partagé) → produit → variantes ; suspension boutique → produits ;
réservation produits (partagé) → variantes ; toujours dans l'ordre des identifiants.

### 3.18 Double authentification de l'équipe (S6-T03)

Décision : [ADR-0034](adr/0034-double-authentification-equipe.md) (MED-15). Module `identity` : `domain/totp.ts` (RFC 6238),
`domain/second-factor.ts`, `application/second-factor.service.ts`, `infrastructure/aes-secret-box.ts` (AES-256-GCM),
`infrastructure/prisma-second-factor.repository.ts`, `interface/second-factor.controller.ts`, commande `src/cli/mfa-reset.ts`.

```mermaid
sequenceDiagram
    participant M as Modérateur / admin
    participant API
    M->>API: route d'équipe (session non confirmée)
    API-->>M: 403 DEUX_FACTEURS_A_ACTIVER
    M->>API: POST /auth/2fa/setup (mot de passe)
    API-->>M: secret (QR code) + avis e-mail
    M->>API: POST /auth/2fa/enable (1er code)
    API-->>M: 10 codes de secours (une fois), session confirmée 15 min
    M->>API: route d'équipe → 200
    Note over M,API: après 15 min : 403 DEUX_FACTEURS_REQUIS → POST /auth/2fa/verify (code)
```

| Table / colonne                      | Contenu                                                   | Règles SQL ajoutées à la main                                           |
| ------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| `identity.second_factors`            | Secret chiffré, activation, dernière période, échecs 24 h | 49 octets, version 1 ; période qui ne recule jamais ; compteur cohérent |
| `identity.recovery_codes`            | Empreinte SHA-256 de chaque code, date d'usage            | Empreinte hexadécimale ; un code utilisé ne change plus                 |
| `identity.sessions.second_factor_at` | Dernière confirmation de la session                       | —                                                                       |

Essais : 3 échecs en 15 minutes → session fermée et 15 minutes de blocage ; 10 échecs en 24 heures → toutes les sessions du compte
fermées. `mfa:reset` (commande serveur) supprime la 2FA, ferme les sessions et rend le mot de passe inutilisable.

### 3.19 Photos des produits des vendeurs (S6-T04)

Décision : [ADR-0035](adr/0035-photos-produits-vendeurs.md). Module `catalog` : `domain/product-image.ts` (règles pures),
`infrastructure/sharp-image-processor.ts` (réencodage), `infrastructure/prisma-product-image.store.ts` (port `ProductImageStore`,
remplaçable par un stockage objet), `interface/product-image.controller.ts` (route publique). Module `vendors` : droits, journal,
routes du vendeur et de la modération.

```mermaid
sequenceDiagram
    participant V as Vendeur
    participant API
    participant DB as PostgreSQL
    participant S as Site (relais /images/v)
    V->>API: POST …/images (fichier brut, Bearer)
    API->>API: vérification rapide (boutique, produit, place)
    API->>API: réencodage WebP 1600 + 480 px, sans métadonnées (2 à la fois, 15 s)
    API->>DB: photo + produit renvoyé en modération (une transaction, sous verrou)
    Note over API,DB: la modération voit la photo ; elle valide la version lue
    S->>API: GET /product-images/{id}/small (clé interne, adresse du visiteur)
    API->>DB: produit visible ? puis octets
    API-->>S: WebP (cache 60 s) ou 404
```

| Table                    | Contenu                                                                        | Règles SQL ajoutées à la main                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `catalog.product_images` | Produit, grande image (1 600 px) et vignette (480 px) en WebP, taille, SHA-256 | 16 o à 2 Mo, en-tête WebP sur les deux, 1 à 1 600 px, empreinte hexadécimale ; **jamais modifiée** (déclencheur) |

Adresse rangée dans `products.images` : `/images/v/<id>.webp` (vignette : `…-480.webp`), comme une photo du catalogue Kemdia : cartes,
panier et commandes n'ont rien à changer. Ajouter une photo renvoie le produit en modération ; la retirer (effacée aussitôt) ou changer
l'ordre ne le fait pas. Envoi : corps lu seulement avec un jeton de session bien formé, 6 envois en cours au plus (503 sinon).

### 3.20 Commandes des vendeurs (S6-T07)

Décision : [ADR-0038](adr/0038-commandes-vendeurs.md) (règle BR-013). Chaque commande a une **part par boutique**
(`orders.order_shop_parts`) ; la boutique de chaque article est figée sur sa ligne (`order_items.shop_id`).

```
Commande confirmée (payée, ou paiement à la livraison)
   └─► parts de vendeurs ouvertes, échéance = +24 h ; part Kemdia acceptée d'office ; e-mail « nouvelle commande » (tâche)
Vendeur : accepter ─► toutes les parts acceptées ? ─► commande « en préparation »
Vendeur : refuser (motif 5 à 300 caractères) ─┐
Échéance dépassée (tâche, chaque minute) ─────┴─► commande ENTIÈRE annulée : stock et coupon rendus,
                                                  remboursement « à faire », avoir (crochet onVendorCancel)
```

| Route (`/api/v1/vendors/orders`) | Rôle                                                 |
| -------------------------------- | ---------------------------------------------------- |
| `GET /`                          | Commandes de SA boutique, par statut, par pages      |
| `GET /{référence}`               | Ses articles, la ville de livraison, l'échéance      |
| `POST /{référence}/accept`       | Accepter                                             |
| `POST /{référence}/refuse`       | Refuser avec motif (gardé chez Kemdia) : tout annulé |

Le vendeur ne voit jamais le nom, le téléphone ni l'adresse du client. Boutique vérifiée active dans la transaction ;
commande sans produit de la boutique = 404. Encaissement en espèces refusé tant qu'une part attend. Journal d'audit :
`order.vendor_accepted`, `order.vendor_refused`, `order.vendor_timeout`. Contrat de l'API : 1.18.0.

### 3.21 Vérification des vendeurs, KYC (S6-T08)

Décision : [ADR-0039](adr/0039-verification-vendeurs.md) (règle BR-024). Un dossier par boutique (`vendors.kyc_files`)
et ses photos (`vendors.kyc_documents`).

```
Vendeur : PUT /vendors/kyc (numéros chiffrés) ─► POST /vendors/kyc/documents/{recto|verso|rccm} (WebP sans
   métadonnées, chiffré) ─► POST /vendors/kyc/submit ─► en attente
Administrateur (2FA) : GET /admin/kyc (file) ─► GET /admin/kyc/{boutique} et ses photos (journal d'audit)
   ─► approve | reject (motif) ─► photos effacées 30 jours plus tard (tâche, chaque heure)
```

Chiffrement AES-256-GCM, clé `KYC_ENCRYPTION_KEY` (différente de la clé TOTP), données associées « boutique:champ » ; seuls
les 4 derniers caractères restent en clair. Sans clé (démo comprise) : `KYC_INDISPONIBLE`. Un KYC non validé bloque
seulement les versements. Contrat de l'API : 1.19.0.

### 3.22 Livraisons, module `shipping` (S7-T01)

Décision : [ADR-0040](adr/0040-livraisons-module-shipping.md) (règle BR-021). Schéma `shipping` : barème des zones
(`delivery_tariffs`), expéditions (`shipments`, une par commande) et leur historique en ajout seul
(`shipment_events`). Le module dépend de `orders` par ses ports `OrderShipping` et `DeliveryTariffs` (inscription au
démarrage : le devis et la commande lisent le barème réglé, dans leur transaction).

```
Commande confirmée ou en préparation, vendeurs d'accord ─► GET /admin/shipping/ready
   ─► hand-over : commande « expédiée », expédition « en route » (frais, part Kemdia 15 % entier inférieur, reste)
   ─► delivered : commande « livrée »  |  failed (motif) ─► retry (tentative + 1) ou cancel (note) :
      commande annulée (livraison_echec), stock et coupon rendus, payments : remboursement « à faire », avoir
```

Transporteur « manuel » (port `Carrier`) tant que la question ouverte n° 5 n'est pas tranchée.

S7-T02 ([ADR-0041](adr/0041-livraisons-ecrans.md)) : le client lit sa livraison (`GET /orders/{n°}/shipment`) ; e-mails
« en route » et « livrée » mis en file (`shipment_emails`) dans la transaction de l'étape, envoyés chaque minute
(réservation, 5 essais, abandon sans adresse vérifiée ou sans objet). Administrateurs seuls,
double authentification confirmée. Règles SQL : parts des frais, passages de statut, champs figés, historique en ajout
seul, bornes du barème ; la commande peut passer d'« expédiée » à « annulée » (jamais par le client).

### 3.23 Données personnelles, module `privacy` (S7-T08)

Décision : [ADR-0047](adr/0047-donnees-personnelles-apdpvp.md) (loi n°001/2011 modifiée par la loi n°025/2023,
APDPVP). Module sans table : chaque module exporte sa classe `XxxPersonalData` (copie, empêchements, effacement),
`privacy` les assemble dans une seule transaction ; aucun module ne l'importe.

```
GET  /account/data      ─► copie JSON de tous les modules (journal account.data_exported)
GET  /account/deletion  ─► { possible, reasons: COMMANDE_EN_COURS | REMBOURSEMENT_EN_ATTENTE | BOUTIQUE_OUVERTE | COMPTE_EQUIPE }
POST /account/delete    ─► mot de passe (3 erreurs : blocage + session fermée) ─► transaction : compte FOR UPDATE,
   empêchements revérifiés, effacement (identité, panier, KYC ; commandes / paiements anonymisés ; factures gardées
   10 ans), journal account.deleted ─► e-mail « compte supprimé »
Chaque nuit (2 h) : sans activité depuis 3 ans − 30 jours ─► avis par e-mail ; 30 jours après, toujours absent ─► effacé
```

Colonnes : `identity.accounts` (`terms_accepted_at`, `adult_confirmed_at`, `last_active_at`, `inactivity_notice_at`,
`deleted_at`) ; `anonymized_at` sur commandes, paiements et remboursements. Les règles « figées » de la base n'acceptent
qu'**une** anonymisation qui n'efface que les coordonnées. Inscription : case « J'ai 18 ans ou plus » distincte des
conditions. Contrat de l'API : 1.23.0. Registre et procédures : `docs/conformite/`.

### 3.24 Fiche commune et offres (S7.5-T02)

Décision : [ADR-0049](adr/0049-fiches-communes-offres.md). Une **fiche** (`catalog.listings`, ses déclinaisons
`listing_variants`) décrit le produit ; chaque boutique y pose son **offre** (`catalog.products`, une par boutique et par
fiche) avec ses prix et ses stocks par variante (`product_variants.listing_variant_id`). Paniers, commandes et factures
désignent toujours des variantes d'offre : rien n'a changé pour eux.

```
Fiche (listings)  ──1..n──  Déclinaisons (listing_variants)
   │ contenu copié (base)          │ nom copié (base)
   └──1..n── Offres (products, boutique) ──1..n── Variantes d'offre (prix, stock) ◄── panier, commande
Agrégats de la fiche (base) : prix « à partir de », nombre d'offres visibles
Fiche pas encore en ligne : suit le statut de l'offre de la boutique qui l'a créée (modération)
```

| Qui          | Routes (`/api/v1`)                                                                                                          | Règle                                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Client       | `GET /products` (une carte par fiche), `GET /products/{slug}?ville=` (offres, offre mise en avant)                          | en stock → moins chère → ville du client → identifiant             |
| Vendeur      | `GET /vendors/listings?q=`, `POST /vendors/listings/{id}/offer`, `POST /vendors/products/{id}/variants`                     | offre en ligne tout de suite ; contenu seulement avant publication |
| Équipe (2FA) | `GET/PATCH /moderation/listings/{id}`, `DELETE …/images/{imageId}`, `POST …/merge`, `POST /moderation/offers/{id}/withdraw` | journal d'audit ; jamais sur sa propre boutique                    |

Journal d'audit : `offer.created`, `offer.variant_added`, `offer.restored`, `offer.withdrawn`, `listing.updated`,
`listing.image_removed`, `listing.merged` (cible `listing` ajoutée). Boutiques vues du catalogue : `catalog.sellers`,
tenue par `vendors` à chaque décision. Contrat de l'API : 1.24.0.

**Écrans et propositions de correction (S7.5-T03, [ADR-0050](adr/0050-ecrans-fiches-offres.md)).**

- Page produit : le cookie `kemdia_ville` (ville choisie) part en `?ville=`. « Vendu par » montre l'offre mise en avant ;
  « Autres vendeurs » liste les autres offres de la même déclinaison, chacune avec son ajout au panier.
- Vendeur : « Ajouter un produit » cherche d'abord une fiche en ligne (`/vendeur/fiches/{id}` pour y vendre). Sinon il
  crée la fiche, photos d'abord.
- Une boutique propose une correction d'une fiche en ligne où elle vend : `catalog.listing_corrections`, 10 à 500
  caractères, 10 ouvertes au plus par boutique (verrou consultatif par boutique). L'équipe la clôt avec une réponse
  facultative (300 caractères au plus).

| Qui          | Routes (`/api/v1`)                                                                                | Règle                                       |
| ------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Vendeur      | `GET /vendors/listings/{id}`, `POST /vendors/products/{id}/corrections`                           | fiche en ligne ; offre de sa boutique       |
| Équipe (2FA) | `GET /moderation/listing-corrections?status=&listingId=`, `POST …/listing-corrections/{id}/close` | jamais la proposition de sa propre boutique |

Journal d'audit : `listing.correction_proposed`, `listing.correction_closed`. Espace de l'équipe : section « Fiches
produits » (`/equipe/fiches`, `/equipe/fiches/{id}`). Contrat de l'API : 1.25.0.

### 3.25 Rôles détaillés de l'équipe, écran Utilisateurs et appareils (S7.5-T04)

Décision : [ADR-0051](adr/0051-roles-equipe-utilisateurs.md). `MODERATOR` devient `CATALOG` (renommage dans la base :
aucun accès perdu) ; `LOGISTICS`, `FINANCE` et `SUPPORT` s'ajoutent. `admin` a les droits de tous les autres
(`ROLE_IMPLIES` du contrat, recopié dans le domaine et vérifié par un test). Double authentification obligatoire pour
tout rôle de l'équipe ; `admin` ne s'accorde que par la commande serveur.

| Rôle           | Pages du site (`/equipe/…`)                           | Routes de l'API                                                        |
| -------------- | ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Catalogue      | `moderation`, `fiches`, `boutiques`, `verifications`  | `/moderation/*`, `/admin/shops`, `/admin/kyc`, fiches et offres        |
| Logistique     | `livraisons`, `livraisons/bareme`                     | `/admin/shipping/*`                                                    |
| Finance        | (écrans au S7.5-T05)                                  | paiements, remboursements, encaissements, factures, codes promo        |
| Service client | `clients`, `clients/{id}`, `clients/{id}/{reference}` | `POST /support/accounts/lookup` (journal), `GET …/{id}/orders[/{ref}]` |
| Administrateur | toutes, plus `utilisateurs`                           | toutes, plus `/admin/staff` et `/admin/accounts/*`                     |

Écran Utilisateurs : `GET /admin/staff?role=&after=&limit=` (par nom), `POST /admin/accounts/lookup`,
`PUT|DELETE …/roles/{role}`, `POST …/remove-staff` (rôles de l'équipe retirés, vendeur gardé, sessions fermées),
`POST …/disable` (motif 5 à 300 caractères au journal, sessions fermées), `POST …/enable`. Jamais sur soi, jamais sur un
administrateur (`COMPTE_PROTEGE`), jamais un compte effacé. Le site exige la case « Je confirme ».

Appareils : cookie `HttpOnly` `kemdia_appareil` (32 octets base64url, 1 an renouvelé à chaque connexion) → champ
`device` de `POST /auth/login`. Table `identity.known_devices` : empreinte SHA-256, résumé du navigateur, 20 au plus par
compte sans lien valable, purgée après un an sans connexion, effacée avec le compte et présente dans la copie des
données. Appareil inconnu (ou connexion sans identifiant) → e-mail « new-device » (description tirée de listes fixes)
avec `PUBLIC_SITE_URL/securite/pas-moi?jeton=…` (usage unique, 7 jours, empreinte seulement), 5 avis valables au plus
par compte ; seul l'appareil de l'inscription (`signup/verify`, champ `device`) est retenu sans avis. La page n'agit
qu'au clic ; `POST /auth/devices/not-me` (sans session) ferme toutes les sessions, bloque le mot de passe et oublie
l'appareil.

Journal d'audit : `staff.removed`, `account.disabled`, `account.enabled`, `support.account_viewed`,
`support.lookup_failed`, `support.orders_viewed`, `device.new_login`, `device.not_me`. Contrat de l'API : **2.0.0** (rôle `moderator` retiré).

### 3.26 Écrans de la Finance et journal d'audit (S7.5-T05)

Décision : [ADR-0052](adr/0052-ecrans-finance-journal.md). Pages de l'équipe (rôle Finance, administrateur compris) :
`/equipe/factures`, `/equipe/encaissements`, `/equipe/remboursements`, `/equipe/codes-promo`, `/equipe/reglages` ;
administrateurs : `/equipe/journal`.

| Route (`/api/v1`)                      | Règle                                                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /admin/invoices?q=&after=`        | 30 par page, du plus récent ; `q` = numéro de facture, d'avoir ou de commande seulement                                                     |
| `GET /admin/invoices/{number}`         | PDF (même que le client) ; `invoice.downloaded` au journal                                                                                  |
| `POST /admin/invoices/{number}/resend` | Envoi immédiat à l'e-mail vérifié ; `ENVOI_IMPOSSIBLE` pendant l'envoi automatique, < 10 min ou 5 renvois par client et par heure ; journal |
| `GET /admin/cash-to-collect`           | Commandes à la livraison expédiées ou livrées, non encaissées ; livrées d'abord, 100 au plus                                                |

Les écrans réutilisent les routes existantes : remboursements (`/admin/refunds`), encaissement
(`/admin/orders/{reference}/cod-collected`), codes promo (`/admin/coupons`), réglages (`/admin/settings/billing`,
`/admin/settings/cod`), journal (`/admin/audit`). Le relais du PDF (`/equipe/factures/{numéro}`) ne passe qu'un fichier
commençant par `%PDF-`, de 5 Mo au plus, sans cache, et refuse un lien venu d'un autre site. Index ajoutés sur
`payments.invoices` (date d'émission décroissante, numéro de commande). Contrat de l'API : **2.1.0**.

### 3.27 Recherche : suggestions et tolérance aux fautes (S7.5-T06)

Décision : [ADR-0053](adr/0053-recherche-suggestions-fautes.md). Extension PostgreSQL `pg_trgm` et index GIN
trigrammes sur `catalog.listings.search_text` (migration `20261023090000_recherche_approchee`).

| Route (`/api/v1`)                   | Règle                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /products`, `/products/facets` | Si aucune fiche visible ne contient les mots (filtres du client non compris), chaque mot est remplacé par le plus proche du catalogue ; `correctedQuery` ; `exact=1` l'empêche |
| `GET /products/suggestions?q=`      | Dès 2 lettres : 4 produits, 2 rayons, 2 marques (+ 2 boutiques depuis S8-T05, §3.36) ; même correction ; 20 appels par minute et par adresse (60 via le site)                  |

Correction : mots proches donnés par la base (trigrammes, seuil 0,3 dans la transaction), choix par distance d'édition
(inversion = 1 faute ; 1 faute jusqu'à 4 lettres, 2 jusqu'à 7, 3 au-delà ; pas de correction sous 3 lettres) ; un mot
sans remplaçant annule la correction ; un mot présent dans le catalogue n'est jamais corrigé ; une seule requête pour
tous les mots ; correction gardée 30 s, 120 corrections en base par minute au plus (en mémoire, une instance). Site : champ de recherche en « combobox » accessible (250 ms après la dernière
frappe), relais `/recherche/suggestions` (clé interne + adresse du visiteur, sans cache partagé), bandeau
« Résultats pour … / Chercher exactement … ». Contrat de l'API : **2.2.0**.

### 3.28 Boutiques publiques, quartier et « près de chez moi » (S7.5-T07)

Décision : [ADR-0054](adr/0054-boutiques-publiques-quartier.md). Migration `20261023120000_boutiques_quartier` :
`vendors.shops.neighborhood` ; villes ramenées au nom officiel ; copie publique `catalog.sellers` enrichie (quartier,
description, `official`, `active`, `since`), index unique sur l'adresse et `(active, city)`.

| Route (`/api/v1`)                   | Règle                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `PATCH /vendors/shop`               | Vendeur : ville et quartier (listes de la livraison), description ; jamais le nom ; 10/min par compte ; `shop.profile_updated` |
| `GET /shops?ville=&quartier=&page=` | Boutiques actives, 24 par page : officielle d'abord, puis le quartier du client, puis par nom ; nombre de produits visibles    |
| `GET /shops/{slug}`                 | Boutique active seulement (sinon 404) ; ni téléphone, ni propriétaire, ni identifiant interne                                  |
| `GET /products?shop={slug}`         | Fiches où la boutique a une offre visible, avec SON prix et SON stock ; boutique pas active : liste vide                       |

La copie publique est tenue par le module vendors à chaque décision et à chaque modification (`since` écrit une seule
fois, à la première validation) ; le catalogue ne lit jamais les tables de vendors. Site : `/boutiques` (ville du
cookie `kemdia_ville` par défaut, puis quartier), `/boutique/{slug}`, `/vendeur/boutique`, listes de ville et de
quartier dans la demande d'ouverture, liens depuis la fiche produit. Contrat de l'API : **2.3.0**.

### 3.29 Photo de profil (S7.5-T08)

Décision : [ADR-0055](adr/0055-photo-de-profil.md). Migration `20261023170000_photo_profil` : `identity.account_avatars`
(carré WebP de 256 px, 256 Ko au plus) et `identity.accounts.avatar_version`.

| Route (`/api/v1`)     | Règle                                                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `POST /auth/avatar`   | Corps = le fichier (JPEG, PNG, WebP ; 5 Mo ; 200 px) ; recadré au centre, réencodé sans métadonnées ; 10/min par compte |
| `GET /auth/avatar`    | La photo du compte connecté seulement ; `private, no-cache` + `ETag`                                                    |
| `DELETE /auth/avatar` | Retrait ; les initiales reviennent                                                                                      |

Version de la photo dans `AccountView.avatar`. Site : relais `/compte/photo` (session, adresse versionnée, cache privé
du navigateur seulement), initiales sur une couleur propre à la personne, photo dans l'en-tête et « Mon compte ».
Effacée avec le compte ; présente dans la copie des données. Contrat de l'API : **2.4.0**.

### 3.30 Avis des clients (S8-T01)

Décision : [ADR-0056](adr/0056-avis-clients.md). Nouveau module **`reviews`** (schéma PostgreSQL `reviews`, migration
`20261023200000_avis_clients`) : un avis par fiche et par compte, réservé à un client livré (ports publics
`ListingRatings` de catalog et `OrdersPurchases` de orders).

| Route (`/api/v1`)                                         | Règle                                                                                                                                                             |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /products/{slug}/reviews`                            | Public : avis publiés (10 par page), moyenne et répartition ; prénom et initiale, « achat vérifié »                                                               |
| `GET/PUT/DELETE /products/{slug}/reviews/mine`            | Session ; écriture réservée à un client livré (`ACHAT_REQUIS`) ; note seule publiée, commentaire en attente                                                       |
| `GET /admin/reviews`, `POST …/{id}/publish` ou `…/reject` | Rôle Catalogue + double authentification ; décision sur la version lue (`AVIS_MODIFIE` sinon) ; refus avec motif ; journal `review.published` / `review.rejected` |

La note des fiches (`listings.rating`, `review_count`) est recalculée à partir des avis publiés dans la même transaction
que chaque changement, **fiche verrouillée** d'abord (avis simultanés). Une **fusion de fiches** déplace les avis vers la
cible (le plus récent d'un même client reste). Une fiche retirée de la vente laisse son auteur voir et retirer son avis. Avis dans la copie des données et effacés avec le compte. Site : section « Avis clients » de la
fiche, page `/equipe/avis`. Contrat de l'API : **2.5.0**.

### 3.31 Bêta fermée et « Signaler un problème » (S8-T02)

Décision : [ADR-0057](adr/0057-beta-fermee-signalements.md). Migration `20261023230000_beta_fermee` : réglage unique
`identity.beta_settings` (ouvert au départ), invitations `identity.beta_invitations` (une ligne par adresse, 30 jours,
une seule utilisation), nouveau module **`feedback`** (schéma `feedback`, table `problem_reports`).

| Route (`/api/v1`)                                          | Règle                                                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /auth/beta`                                           | Public : l'inscription est-elle réservée aux invités ?                                                                                                     |
| `GET/PUT /admin/beta/settings`                             | Administrateur + double authentification ; journal `settings.beta_updated`                                                                                 |
| `GET/POST /admin/beta/invitations`, `POST …/{id}/revoke`   | Administrateur + double authentification ; adresse déjà inscrite `COMPTE_EXISTANT` ; invitation utilisée `INVITATION_UTILISEE` ; journal sans l'adresse    |
| `POST /auth/signup`, `POST /auth/signup/verify` (changées) | Inscription réservée : invitation valable exigée (`INVITATION_REQUISE`) **avant** de regarder si l'adresse a un compte ; revérifiée au code, puis utilisée |
| `POST /feedback/problems`                                  | Session ; 5 par minute ; 20 non résolus par compte ; page réduite à son chemin ; appareil résumé par l'API                                                 |
| `GET /admin/problems`, `POST …/{id}/status`                | Service client + double authentification ; décision sur la version lue (`SIGNALEMENT_MODIFIE`) ; journal `problem.updated`                                 |

Les invitations restent dans `identity` (l'inscription en dépend ; un module à part créerait une dépendance
circulaire). Invitation utilisée et signalements dans la copie des données, effacés avec le compte ; ménage des
invitations mortes (30 jours) et des signalements résolus (180 jours). Site : annonce sur « Créer un compte », bouton
« Signaler un problème » dans le pied de page (`/signaler-un-probleme`, connexion exigée), pages `/equipe/beta` et
`/equipe/signalements`. Contrat de l'API : **2.6.0**.

### 3.32 Import du vrai catalogue (S8-T03)

Décision : [ADR-0058](adr/0058-import-catalogue.md). Migration `20261023233000_import_catalogue` : colonne
`catalog.products.import_reference` (minuscules, unique par boutique).

| Route (`/api/v1`)                  | Règle                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /admin/catalog-import/check` | Équipe Catalogue + double authentification ; corps `text/csv` (2 Mo, 1 000 lignes) ; compte rendu de toutes les erreurs, rien n'est écrit               |
| `POST /admin/catalog-import`       | Même accès ; boutiques verrouillées, fichier revérifié, puis tout écrit dans une transaction ou rien ; produits en attente ; journal `catalog.imported` |

L'analyse du fichier est dans le domaine de `vendors` (pure) ; les produits sont créés par `VendorCatalog.importProduct`
(même chemin qu'un vendeur, sans limite de file d'attente). Boutiques partenaires actives seulement ; une référence déjà
importée est ignorée. Site : page `/equipe/import` (modèle, aide, catégories, compte rendu) et relais
`/equipe/import/fichier` (session avant lecture, UTF-8 ou Windows-1252). Contrat de l'API : **2.7.0**.

### 3.33 Accueil durablement sous 300 ms (S8-T04)

Décision : [ADR-0059](adr/0059-accueil-300ms-etalonnage.md). Aucun changement de l'API ni de la base.

| Changement                                      | Effet                                                                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `ProductImage` en simple `<img>`                | `getImageProps` : mêmes adresses, `srcset` et optimiseur que `<Image>`, sans composant à hydrater (~25 photos à l'ouverture de l'accueil)  |
| Pied de page dans `HydrateWhenVisible`          | Hors écran à l'ouverture : ses liens ne sont rendus interactifs qu'à l'approche (`components/ui/HydrateWhenVisible.tsx`, partagé)          |
| Processeur étalonné (`e2e/performance.spec.ts`) | Ralentissement `4 × 20 ms / étalon` (×2 à ×8) : même téléphone simulé quelle que soit la machine de CI ; étalon et ralentissement affichés |
| Budget de l'accueil                             | Médiane de **5** chargements ; blocage **bloquant au-delà de 300 ms** (350 ms au S7-T03)                                                   |

### 3.34 Accueil : encart du compte (S8-T08)

Décision : [ADR-0060](adr/0060-accueil-encart-compte.md). Aucun changement de l'API ni de la base.

| Visiteur        | Encart du compte                                        | Encart vert                                                |
| --------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| Non connecté    | « Bienvenue sur Kemdia », Se connecter, Créer un compte | Vendez sur Kemdia → « Devenir vendeur » (`/vendre`)        |
| Client connecté | « Bonjour, {prénom} », Mes commandes, Mon compte        | Vendez sur Kemdia → « Devenir vendeur » (`/vendre`)        |
| Vendeur         | « Bonjour, {prénom} », Mes commandes, Mon compte        | Votre boutique → « Accéder à votre boutique » (`/vendeur`) |

Compte lu par `getCurrentAccount()` (partagé avec l'en-tête, une fois par requête) ; prénom et oui/non vendeur seuls
transmis à l'encart, rendu par le serveur (`HeroAccountPanel`).

### 3.35 Machines de la CI fixées (S8-T09)

Décision : [ADR-0061](adr/0061-ci-ubuntu-2404.md). Aucun changement de l'API, du site ni de la base.

Tous les jobs des workflows (`ci`, `_deploy`, `release`, `security`, `zap`) tournent sur `ubuntu-24.04` au lieu de
`ubuntu-latest`. GitHub fait passer `ubuntu-latest` à Ubuntu 26 depuis le 2026-10-19 ; sur cette image,
`playwright install --with-deps chromium` échoue et bloque le job « Bout en bout et performance ». Le passage à une
version plus récente se fera par une tâche dédiée, quand Playwright la prendra en charge.

### 3.36 Recherche : boutiques dans les suggestions (S8-T05)

Décision : [ADR-0062](adr/0062-suggestions-boutiques.md). Contrat **2.8.0** ; aucune migration.

| Étape     | Ce qui se passe                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Mots      | Mots **tapés** (`searchTerms`) ; mots corrigés seulement si les mots tapés ne trouvent aucune boutique                           |
| Recherche | `PublicShops.suggest` : boutiques **actives** de `catalog.sellers` dont le nom (sans accents ni ponctuation) contient chaque mot |
| Ordre     | Boutique officielle d'abord, puis par nom ; **2 au plus**                                                                        |
| Réponse   | `shops: [{ slug, name, city, official }]` (jamais l'identifiant interne, le téléphone ni le propriétaire)                        |
| Site      | Ligne « boutique » (icône, nom, ville) entre marques et produits, vers `/boutique/<adresse>` construite par le site              |

### 3.37 Page d'une boutique : prix de SON offre (S8-T06)

Décision : [ADR-0063](adr/0063-boutique-prix-offre.md). Contrat **2.8.1** ; aucune migration.

| `GET /products?shop=` et `/products/facets?shop=` | Lu sur                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `priceMin`, `priceMax`, compteurs des tranches    | `catalog.products.price` de l'offre de la boutique (une au plus par fiche)     |
| `onlyDeals`, compteur « en promotion »            | `catalog.products.compare_at_price` de son offre                               |
| `sort=prix-asc` / `prix-desc`                     | Fiches de la page choisies et ordonnées sur la table des offres, puis relues   |
| Autres filtres et tris                            | Inchangés (fiche) ; une offre compte si elle a au moins une déclinaison active |

Hors page de boutique : prix « à partir de » de la fiche, comme avant.

### 3.38 Compteurs partagés en base (S8-T07)

Décision : [ADR-0064](adr/0064-compteurs-partages-en-base.md). Migration `20261027120000_compteurs_partages` (schéma
`platform`) ; aucun changement de l'API.

| Compteur (clé)                                                | Fenêtre et limite                                              | Utilisé par               |
| ------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------- |
| `limite:default:<empreinte>` (adresse)                        | 1 min, `RATE_LIMIT_PER_MINUTE` (×3 via le site), blocage 1 min | `KemdiaThrottlerGuard`    |
| `limite:compte:compte:<compte>:<route>`                       | selon la route (`SessionGuard`), blocage                       | module identity           |
| `coupon:<compte>`                                             | 15 min, 10 refus (essai réservé avant la vérification)         | module orders             |
| `facture-renvoi:<facture>`, `facture-renvois-client:<compte>` | 10 min, 1 ; 1 h, 5                                             | module payments (Finance) |
| `recherche:corrections`                                       | 1 min, 120                                                     | module catalog            |

`src/database/rate-counters.ts` : `PostgresRateCounters` (une requête `INSERT … ON CONFLICT DO UPDATE` par comptage),
`FallbackRateCounters` (repli en mémoire si la base échoue ou dépasse 500 ms ; clés bloquées plus écrites), ménage
toutes les 10 minutes. `RATE_LIMIT_STORE` : `database` (par défaut hors tests, seul permis en production) ou `memory`.
Restent en mémoire de chaque instance : arborescence des rayons (60 s), corrections calculées (30 s), opérateur simulé.

## 4. Choix technologiques

| Couche    | Choix                                                                  | Version     | Justification                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Langage   | TypeScript (strict)                                                    | 6.0         | Un seul langage front/back — [ADR-0002](adr/0002-stack-typescript-nextjs.md) ; 6.0 « pont » vers la 7 ([ADR-0014](adr/0014-versions-outils-typescript-eslint.md)) |
| Frontend  | Next.js (App Router) + React                                           | 16.4 / 19.2 | SSR/SSG, SEO, Server Components                                                                                                                                   |
| Style     | Tailwind CSS                                                           | 4           | Design tokens centralisés, CSS final minimal                                                                                                                      |
| Icônes    | lucide-react                                                           | —           | Seules les icônes utilisées sont embarquées                                                                                                                       |
| Polices   | Inter + Montserrat (auto-hébergées, @fontsource)                       | —           | Aucune requête vers Google : vie privée + CSP stricte                                                                                                             |
| Tests     | Vitest + Testing Library                                               | 5           | Rapide, compatible TypeScript                                                                                                                                     |
| Qualité   | ESLint (configuration « à plat »)                                      | 10 / 9      | 10 pour l'API et le contrat, 9 pour le site tant que `eslint-config-next` ne suit pas ([ADR-0014](adr/0014-versions-outils-typescript-eslint.md))                 |
| Monorepo  | pnpm + Turborepo                                                       | 10 / 2      | [ADR-0003](adr/0003-monorepo.md)                                                                                                                                  |
| Conteneur | Docker (Node 22 Alpine, utilisateur non-root)                          | —           | Même artefact en préprod et prod                                                                                                                                  |
| CI/CD     | GitHub Actions                                                         | —           | Intégré au dépôt                                                                                                                                                  |
| Backend   | NestJS (modules ES, Express 5) + Zod + pino                            | 12 / 4 / 10 | S3 — [ADR-0006](adr/0006-monolithe-modulaire-7-modules.md), [ADR-0007](adr/0007-socle-api-nestjs.md)                                                              |
| Base      | PostgreSQL + Prisma (adaptateur `pg`), un schéma par module            | 18 / 7.10   | S3 — [ADR-0008](adr/0008-postgresql-prisma.md)                                                                                                                    |
| API       | OpenAPI 3.1 (depuis Zod), Swagger UI auto-hébergé, `@nestjs/throttler` | 3.1 / 5 / 6 | S3-T04 — [ADR-0010](adr/0010-api-rest-openapi.md)                                                                                                                 |
| Contrat   | Paquet `@kemdia/contracts` (Zod), partagé par l'API et le site         | 4           | S3-T05 — [ADR-0011](adr/0011-site-branche-api.md)                                                                                                                 |

## 5. Architecture du frontend (`apps/web`)

### 5.1 Organisation du code

```
apps/web/src
├── app/                     Routes (1 dossier = 1 URL)
│   ├── page.tsx             Accueil
│   ├── categorie/[slug]/    Liste par catégorie (rendu à la demande : tri/pagination)
│   ├── produit/[slug]/      Fiche produit (variante choisie par ?variante=<sku>)
│   ├── recherche/           Résultats de recherche (non indexés)
│   ├── connexion/  inscription/  mot-de-passe-oublie/   Parcours d'identité (S2)
│   ├── commande/  favoris/  vendre/                     Tunnel de commande, favoris, page vendeur (S2)
│   ├── promotions/  categories/  panier/  compte/  infos/[slug]/
│   ├── equipe/              Espace de l'équipe (S6-T05) : tableau de bord, sécurité (2FA), boutiques, modération — §5.15
│   ├── vendeur/             Espace vendeur (S6-T06) : demande de boutique, produits, photos (envoi et aperçu) — §5.16
│   ├── sitemap.ts  robots.ts  icon.svg  not-found.tsx  error.tsx  global-error.tsx
│   └── layout.tsx           Gabarit commun : en-tête, pied de page, fournisseurs
├── components/
│   ├── layout/              TopBar, Header, SearchForm, CategoryNav (méga-menu + tiroir), Footer, MobileTabBar
│   ├── home/                Hero + HeroCarousel, CategoryBubbles, FlashSales, CategoryTiles, Countdown, Newsletter
│   ├── catalog/             ProductListing (tri + pagination), Breadcrumbs, SortSelect
│   ├── product/             ProductCard, ProductRail, ProductGallery, BuyBox, StickyBuyBar, AddToCartButton, VariantPicker
│   ├── auth/                Formulaires d'identité, saisie du code OTP, champs accessibles
│   ├── staff/               Cadre de l'équipe, activation de la 2FA, codes de secours, formulaires de décision
│   ├── vendor/              Cadre vendeur, demande de boutique, fiche produit, envoi des photos (réduites)
│   ├── cart/                MiniCart
│   ├── location/            LocationModal (Gabon)
│   ├── providers/           Panier, ville de livraison, notifications
│   └── ui/                  Logo, Price, Rating, CategoryIcon
├── lib/                     Logique pure, testée
│   ├── catalog/             Port du catalogue (server-only) : index.ts (seul point d'entrée des pages),
│   │                        port.ts, api-catalog.ts (HTTP), file-catalog.ts (démo) — §5.9
│   ├── config/              Source du catalogue choisie et vérifiée au démarrage (instrumentation.ts)
│   ├── cart.ts              Réducteur du panier (une ligne = une variante) + validation du stockage
│   ├── product-view.ts      Variante choisie, caractéristiques, ligne de panier de la fiche
│   ├── delivery.ts          Villes, zones, calcul des frais
│   ├── auth/                Validation (téléphone gabonais, e-mail, mot de passe) + port AuthClient
│   ├── staff/               Espace de l'équipe (server-only) : adaptateur API, garde d'accès, actions, QR code
│   ├── vendor/              Espace vendeur : adaptateur API (server-only), garde, actions, règles des formulaires
│   ├── search-params.ts     Validation des paramètres d'URL (liste blanche, adresse de retour)
│   └── format.ts  site.ts  types.ts (types du contrat)  cn.ts
└── instrumentation.ts       Vérifie la configuration au démarrage du serveur

packages/contracts/          Schémas Zod et constantes partagés avec l'API ; données de démonstration (/demo)
```

### 5.2 Rendu des pages

| Page                                        | Mode                                                                                                            | Raison                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Toutes les pages (S4-T07)**               | **À la demande** (`connection()` dans le layout)                                                                | CSP à nonce : chaque page porte le nonce de SA requête (ADR-0021)                            |
| Compte, favoris, commande, pages d'identité | À la demande (statiques avant le S4-T07)                                                                        | Panier et favoris remplis côté navigateur                                                    |
| **Démo seulement (S4-T08)**                 | En-tête et page dans des `<Suspense>` : en-tête de réserve + « La boutique se réveille… » envoyés tout de suite | API endormie (~1 min) ; ailleurs rendu bloquant pour garder les vrais 404/500/307 (ADR-0022) |
| Toute page qui lit le catalogue (S3-T05)    | À la demande (`connection()`)                                                                                   | Aucun appel à l'API pendant `next build` (§5.9) ; cache de 60 s                              |
| Accueil, fiche produit                      | À la demande (S2-T05)                                                                                           | Liens absolus des aperçus WhatsApp tirés de `SITE_URL` au démarrage                          |
| Accueil — bas de page (S3-T08)              | Zones `<Suspense>` envoyées au fil de l'eau                                                                     | Haut de page envoyé sans attendre ; voir ci-dessous                                          |
| Aperçus `opengraph-image`                   | À la demande (S3-T05)                                                                                           | Image 1200 × 630 ; prix lu dans l'API                                                        |
| Catégorie, recherche, promotions            | Dynamique                                                                                                       | Dépend de `?tri=`, `?page=` et des filtres                                                   |
| Infos                                       | Liste fermée (`dynamicParams = false`), à la demande depuis le S4-T07                                           | Toute autre URL → 404                                                                        |

Composants **serveur** par défaut ; seuls les éléments interactifs sont des composants **client**
(`"use client"`) : panier, mini-panier, menu, modale de ville, galerie, compte à rebours, tri.

**Accueil allégé (S3-T08)** — ~50 cartes produits sous la ligne de flottaison bloquaient le téléphone au chargement :

| Technique                                                  | Effet                                                                                                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Une zone `<Suspense>` par section (`HomeSections.tsx`)     | Le haut de page part sans attendre les rangées du bas                                                                                                       |
| `content-visibility: auto` (sections du bas, pied de page) | Le navigateur ne calcule leur mise en page qu'à l'approche ; hauteur réservée (`contain-intrinsic-size`)                                                    |
| Hydratation à la demande (`HydrateWhenVisible`)            | Le HTML est là dès le début (référencement), React ne le rend interactif qu'à 400 px de l'écran ou au focus clavier ; navigation côté client : rendu direct |
| Liens de masse sans préchargement (S7-T03, ADR-0042)       | Next.js ne précharge plus ~30 pages au chargement (cartes, rayons, bannière, menu) : moins de calcul et de données mobiles                                  |
| Fenêtre « ville » montée à l'ouverture (S7-T03)            | Fermée, elle n'est ni rendue ni hydratée sur chaque page                                                                                                    |
| Un lien de moins par carte                                 | L'image n'a plus son propre lien : celui du titre couvre déjà toute la carte                                                                                |
| Photos en simple `<img>` (S8-T04, ADR-0059)                | `ProductImage` utilise `getImageProps` : mêmes adresses et tailles, aucune photo à hydrater ; préchargement par `<link rel="preload">`                      |
| Pied de page rendu interactif à l'approche (S8-T04)        | `HydrateWhenVisible` autour du pied de page : 11 liens de moins à hydrater à l'ouverture de chaque page ; focus clavier conservé                            |

### 5.3 Correspondance avec l'ancien projet Django

| Django (ancien)                                                 | Kemdia (nouveau)                                              | Gain                                   |
| --------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- |
| `templates/base.html` (700 lignes : HTML + JS + CSS mêlés)      | `app/layout.tsx` + composants                                 | Séparation, typage                     |
| 3 partials `product_card_*.html` (~760 lignes)                  | 1 `ProductCard` + prop `badge`                                | Pas de duplication                     |
| `header.html` + `location_modal.html` + JS inline               | `Header`, `HeaderActions`, `LocationModal` (`<dialog>` natif) | Accessibilité, pas d'`innerHTML`       |
| `navigation.html` + `category_mega_menu.html`                   | `CategoryNav`                                                 | Méga-menu clavier + tiroir mobile      |
| 18 fichiers CSS + Bootstrap + Font Awesome + AOS + Swiper (CDN) | Tailwind + tokens `@theme`, lucide, défilement natif          | Aucun CDN tiers, ~36 Ko HTML compressé |
| Géolocalisation par IP via service externe                      | Choix explicite ville/quartier                                | Pas de fuite d'IP, pas de SSRF         |

### 5.4 Parcours d'identité (S2-T01, branché sur l'API au S4-T05)

Décision : [ADR-0019](adr/0019-site-branche-identite.md). Les formulaires parlent au port `AuthClient` ; depuis le S4-T05,
il est branché sur des **actions serveur** qui appellent l'API avec la clé interne. Le jeton de session et les tickets
restent dans des cookies `HttpOnly` : le navigateur ne les voit jamais.

```mermaid
flowchart LR
    form[Formulaires<br/>connexion · inscription · oubli] --> port{{Port AuthClient<br/>lib/auth/client.ts}}
    port --> actions[Actions serveur<br/>lib/auth/actions.ts]
    actions --> api[Adaptateur API<br/>lib/auth/api-identity.ts]
    api -->|clé interne| identity[API · module identity]
    actions -->|Set-Cookie HttpOnly| cookie[(Cookies __Host-<br/>session · tickets)]
    header[En-tête · Mon compte] -->|session.ts<br/>10 s en mémoire| api
    proxy[proxy.ts] -->|30 jours glissants| cookie
```

`proxy.ts` (S4-T07, ADR-0021) passe sur **toutes** les adresses sauf `_next/static` et `_next/image`, dans cet ordre :

1. **CSRF** : une requête qui modifie quelque chose doit avoir un `Origin` du site (et `Sec-Fetch-Site: same-origin` si le navigateur l'envoie), sinon 403 ;
2. **CSP à nonce** : nonce neuf, transmis à Next.js et renvoyé dans `Content-Security-Policy` ;
3. **cookie glissant** (S4-T05).

Le site transmet à l'API l'adresse du visiteur (`X-Kemdia-Client-IP`) si `CLIENT_IP_HEADER` est réglé (§5.9).

| Parcours            | Étapes                                                                                                       | Règles / exigences     |
| ------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Inscription         | Prénom, nom, **e-mail** (SMS « bientôt »), mot de passe, CGV → code par e-mail → **compte créé et connecté** | FR-001, BR-041         |
| Connexion           | E-mail + mot de passe ; message neutre ; blocage avec délai ; **retour à la page d'avant** (`?retour=`)      | FR-004, BR-040, MED-01 |
| Mot de passe oublié | E-mail → code → nouveau mot de passe → **connecté ici, déconnecté ailleurs**                                 | FR-012                 |
| En-tête             | « Bonjour, Awa » + menu (Mon compte, Se déconnecter) ; visiteur : « Se connecter » avec retour               | —                      |
| Mon compte          | Identité ; « Se déconnecter » ; « Déconnecter tous mes appareils » ; commandes et adresses « bientôt »       | —                      |

Numéros acceptés : mobiles gabonais à 9 chiffres `06…` (Moov) et `07…` (Airtel), avec ou sans `+241` ;
forme enregistrée `+241077123456`. L'API applique les mêmes règles (§3.9, test `identity-alignment`).
**SMS différé** ([ADR-0015](adr/0015-identite-sessions-otp.md)) : tant que le client n'a pas choisi de fournisseur, `SMS_ENABLED=false`
et l'option téléphone est affichée « bientôt disponible » ; l'inscription et la connexion se font par e-mail.

### 5.5 Charte graphique (tokens `globals.css`)

Direction (S2-T10) : **une place de marché dense**, inspirée des usages des grands sites (Amazon, Jumia) sans reprendre leur identité,
avec une signature propre : le prix affiché comme une **étiquette de marché**.

| Token                     | Valeur                            | Usage                                                                  |
| ------------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| `brand-600`               | `#d61f2c`                         | Rouge Kemdia : actions, bandeau ventes flash, bannière                 |
| `accent-400`              | `#ffc629`                         | Jaune : pastilles de remise (inclinées), bouton « Acheter maintenant » |
| `ink-900`                 | `#14181e`                         | Texte, navigation                                                      |
| `ink-50`                  | `#eef0f3`                         | Fond « marché » : les blocs blancs ressortent                          |
| `forest-600`              | `#0b7a4b`                         | Livraison, stock, espace vendeur                                       |
| `gabon-green/yellow/blue` | `#009e60` / `#fcd116` / `#3a75c4` | Rappels discrets du drapeau                                            |

**Typographie** : une seule famille, **Archivo** à largeur variable (auto-hébergée, aucun CDN) :

| Rôle   | Réglage                                     | Classe                 |
| ------ | ------------------------------------------- | ---------------------- |
| Texte  | largeur 100 %, graisse 400–600              | `font-sans`            |
| Titres | largeur 112 %, graisse 800                  | `h1`–`h3`              |
| Prix   | largeur 78 %, graisse 800, chiffres alignés | `font-price` (`Price`) |

### 5.6 Structure des pages principales

| Page          | Organisation                                                                                                                                                                                                          |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accueil       | Catégories à gauche · carrousel de bannières · raccourcis compte / vendeur ; ronds des rayons ; ventes flash (stock restant, compte à rebours) ; tuiles « un rayon, 4 produits » ; rangées de produits                |
| Fiche produit | Galerie · informations et prix (économie en FCFA) · encadré d'achat (date de livraison selon la ville, 2 boutons, garanties) ; sections Description / Caractéristiques / Avis                                         |
| Listes        | Catégorie, recherche, promotions : même gabarit `CatalogView` — filtres à gauche (prix, marque, promotion, stock, note ; panneau qui monte du bas sur mobile), filtres actifs en pastilles, tri, 20 produits par page |
| Panier        | Barre « livraison offerte » (reste à ajouter), lignes détaillées, récapitulatif collé à droite (en bas sur mobile), suggestions                                                                                       |
| Mobile        | Barre d'onglets en bas (Accueil, Rayons, Promos, Panier, Compte) ; sur la fiche produit, remplacée par une barre d'achat                                                                                              |

Accessibilité du carrousel : pause au survol et au focus, aucun défilement automatique si l'utilisateur réduit les animations,
bannières masquées rendues inactives (`inert`).

### 5.7 Tunnel de commande (S2-T02)

Page `/commande`, en 4 étapes sur une seule page (chaque étape terminée se replie en résumé avec « Modifier ») :

```mermaid
flowchart LR
    panier[Panier] --> a[1. Adresse<br/>nom, téléphone, ville,<br/>quartier, point de repère]
    a --> l[2. Livraison<br/>frais + date prévue]
    l --> p[3. Paiement<br/>Airtel · Moov · à la livraison]
    p --> v[4. Vérifier<br/>et commander]
    v -->|Mobile Money| att[Validation sur<br/>le téléphone]
    v -->|À la livraison| ok[Confirmation]
    att --> ok
```

| Choix                           | Raison                                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Point de repère** obligatoire | Au Gabon, on se repère plus souvent ainsi que par numéro de rue ; c'est ce qui permet au livreur de trouver       |
| Numéro de paiement pré-rempli   | Celui de l'adresse ; l'opérateur est déduit (07 → Airtel, 06 → Moov) et vérifié                                   |
| Paiement à la livraison         | Grisé avec la raison si la ville ou le montant ne le permettent pas (BR-011, valeurs provisoires)                 |
| Montants du serveur             | Devis de l'API (`POST /orders/quote`) : frais, remise du code promo, total, moyens de paiement possibles (S5-T07) |

**Données envoyées au serveur** (`buildOrderRequest`, S5-T07) : adresse, moyen et numéro de paiement ; l'action ajoute la clé d'idempotence,
le total affiché et le code promo. **Aucun article** : l'API commande le panier du compte.
**Jamais de prix, de total ni de frais** : le serveur les recalcule (BR-004, faille CRIT-01 de l'ancien site).

**Depuis le S5-T02** ([ADR-0024](adr/0024-commandes-reservation-stock.md)) : zones, villes, quartiers, frais et règles du paiement à la livraison vivent dans le contrat
(`@kemdia/contracts/delivery`, gelés) ; `lib/delivery.ts` et `lib/checkout.ts` les réexportent. L'API calcule la facture avec le même code
(`POST /orders/quote`), et la commande ne contient que l'adresse, le paiement, une clé d'idempotence et le total affiché.

**Branché sur l'API au S5-T07** ([ADR-0029](adr/0029-site-tunnel-commande-mes-commandes.md)) : la page exige un compte (sinon
`/connexion?retour=/commande`) et pré-remplit le nom et le téléphone du compte. Le devis est demandé dès l'adresse validée, puis à chaque
code promo ou changement du panier ; le bouton reste inactif tant que le devis n'est pas à jour. `PRIX_MODIFIE` → nouveau devis et
nouveau total à confirmer ; `CLE_DEJA_UTILISEE` → panier relu et renvoi vers « Mes commandes ». Après la commande : `CartProvider.reload()`
puis page de la commande (`?nouvelle=1`), où se fait l'attente du paiement Mobile Money (§5.12). L'adaptateur de démonstration
`lib/orders/client.ts` est supprimé.

### 5.8 Favoris, partage et page vendeur (S2-T04 à T06)

| Fonction            | Fonctionnement                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Favoris (FR-014)    | `FavoritesProvider` + `lib/favorites.ts` : stockés dans le navigateur, revalidés au chargement, 100 au plus ; synchronisés avec le compte au S4 |
| Partage WhatsApp    | Lien `wa.me` (texte encodé, `utm_source=whatsapp`), partage natif du téléphone ou copie du lien                                                 |
| Aperçus (OpenGraph) | `opengraph-image.tsx` : image 1200 × 630 par produit (photo, prix, remise) et pour le site, **générées à la construction**                      |
| Page vendeur        | `/vendre` : offre marketplace, étapes, conditions (KYC, BR-024), FAQ, demande d'ouverture (démo ; module `vendors` au S6)                       |

**Adresse publique lue au démarrage** : les aperçus WhatsApp exigent des liens absolus. La même image Docker sert la démo,
le staging et la production : l'adresse vient donc de la variable `SITE_URL` du serveur (`siteUrl()`), et les pages partagées
(accueil, fiches produit, `sitemap.xml`, `robots.txt`) sont rendues à la demande. Le catalogue étant gardé 60 s en mémoire (§5.9),
cela coûte quelques millisecondes par page.

### 5.9 Lecture du catalogue dans l'API (S3-T05)

Décision : [ADR-0011](adr/0011-site-branche-api.md).

```mermaid
flowchart LR
    pages[Pages et en-tête] --> idx[lib/catalog/index.ts<br/>connection + garde de build]
    idx --> port{{CatalogPort}}
    port --> api[api-catalog.ts<br/>HTTP + clé interne<br/>délai, cache 60 s, contrat vérifié]
    api --> v1[(API /api/v1)]
```

| Configuration (au démarrage)                          | Comportement                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `API_URL` + `API_INTERNAL_KEY`                        | Catalogue lu dans l'API ; API muette, en retard ou réponse hors contrat → page d'erreur (500) |
| `API_URL` ou clé absente (tout environnement, S3-T08) | **Le serveur refuse de démarrer** (code 1, message en français nommant la variable)           |
| Adresse ou clé invalides                              | Refus de démarrer                                                                             |

- **Un seul adaptateur** depuis le S3-T08 (le mode fichier est retiré). Jamais de données de secours : une panne doit se voir, pas afficher de faux prix.
  Les tests du site utilisent une fausse API en mémoire (`lib/catalog/test-fake-api.ts`).
- **Construction** : `lib/catalog` appelle `connection()` (la page devient dynamique) puis refuse toute lecture si `NEXT_PHASE` est la construction.
  Une page qui tenterait de lire le catalogue au build fait donc échouer `next build` avec un message renvoyant à l'ADR-0011.
- **En-tête** : rendu sur toutes les pages, il affiche un menu des catégories vide si l'API est indisponible (et seulement dans ce cas) ;
  la page elle-même affiche l'erreur.
- **Panier** (`kemdia.cart.v2`) : une ligne = une variante ; les paniers `v1` sont effacés au chargement. Les **favoris** restent par produit (UUID).
- Variables : `API_URL`, `API_INTERNAL_KEY` (secret), `CATALOG_TIMEOUT_MS` (5000 par défaut, 90 000 au plus),
  `CLIENT_IP_HEADER` (S4-T07, vide par défaut : en-tête de l'hébergeur qui porte l'adresse du visiteur ; `x-forwarded-for` → dernière adresse ;
  nom invalide → refus de démarrer) — voir `apps/web/.env.example`.
- **Démo : écran de réveil (S4-T08, ADR-0022)** : avec `APP_ENV=demo`, la page part tout de suite (en-tête de réserve, puis « La boutique se réveille… »
  après 2 s si l'API dort) et se complète seule ; `robots.txt` interdit l'indexation de la démo.
- **Démo Render (S3-T07)** : au démarrage, le site réveille l'API en arrière-plan (`lib/config/wake-api.ts`, seulement avec `APP_ENV=demo`) ;
  `CATALOG_TIMEOUT_MS=90000` (le maximum, depuis la clôture du S3) laisse au premier visiteur le temps du réveil. `/api/health` du site indique `"catalog": "api"` (toujours, depuis le S3-T08 ; gardé pour le contrôle de la démo).

### 5.10 Panier : navigateur ou compte (S5-T01)

Décision : [ADR-0023](adr/0023-panier-serveur.md). `CartProvider` choisit où vit le panier :

```mermaid
flowchart TB
    layout["layout.tsx : cookie de session présent ?<br/>(présence seule, aucun appel)"] -->|non| local[Panier du navigateur<br/>localStorage kemdia.cart.v2]
    layout -->|oui| sync["syncCart (action serveur)<br/>réunion idempotente (mergeId)<br/>panier local vidé après la réponse"]
    sync -->|connecté| server[Panier du compte<br/>actions serveur → /api/v1/cart]
    sync -->|session refusée / API en panne| local
```

| Règle                                                                                                   | Où                                            |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Le panier du compte n'est **jamais** écrit dans `localStorage` (sinon réuni deux fois)                  | `components/providers/CartProvider.tsx`       |
| Modification affichée tout de suite, puis réponse de l'API ; refus → dernier panier confirmé + message  | idem                                          |
| Ligne signalée par le serveur : raison affichée, hors total, « Commander » désactivé (panier et tunnel) | `app/panier/CartView.tsx`, `CheckoutFlow.tsx` |
| Seuls `{ variantId, quantity }` partent vers le serveur ; arguments revérifiés dans les actions         | `lib/orders/cart-actions.ts`                  |
| Réponses vérifiées par le contrat ; journaux sans jeton ni contenu du panier                            | `lib/orders/api-cart.ts`                      |
| Limites (50 lignes, 20 par ligne) lues dans le contrat, comme l'API                                     | `lib/cart.ts`                                 |

### 5.11 Téléphone simulé (S5-T05)

Page `/demo/telephone` ([ADR-0027](adr/0027-notifications-signees-bac-a-sable.md)) : existe seulement avec `APP_ENV` = `local`,
`e2e` ou `demo` (sinon 404, comme quand l'API répond que le bac à sable est fermé) ; non indexée. Le client connecté voit les
demandes de paiement Mobile Money de son compte, saisit un code PIN fictif et valide, ou refuse.

| Fichier                                | Rôle                                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------- |
| `app/demo/telephone/page.tsx`          | Page serveur : liste lue dans l'API avec le jeton de session                          |
| `components/payments/SandboxInbox.tsx` | Cartes des demandes ; message de la dernière réponse gardé quand la demande disparaît |
| `components/payments/AutoRefresh.tsx`  | Relit la page toutes les 5 s (onglet visible)                                         |
| `lib/payments/sandbox-actions.ts`      | Action serveur : champs revérifiés (UUID, décision, PIN), puis API                    |
| `lib/payments/api-sandbox.ts`          | Adaptateur `server-only` (clé interne + jeton), réponses vérifiées par le contrat     |

### 5.12 « Mes commandes » et attente du paiement (S5-T07)

Décision : [ADR-0029](adr/0029-site-tunnel-commande-mes-commandes.md). Compte obligatoire (`requireAccount`, retour après connexion).

| Fichier                                                       | Rôle                                                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `app/compte/commandes/page.tsx`                               | Liste, 10 par page, de la plus récente à la plus ancienne (`?avant=` = curseur vérifié)                                      |
| `app/compte/commandes/[reference]/page.tsx`                   | Détail : articles, totaux, livraison, paiement, factures, suivi, annulation ; relue toutes les 5 s si en attente de paiement |
| `app/compte/commandes/[reference]/factures/[numero]/route.ts` | Relais du PDF (session, numéros revérifiés, pièce jointe, `nosniff`, `private, no-store`, 2 Mo au plus)                      |
| `components/orders/PaymentPanel.tsx`                          | Attente Mobile Money : demande en cours, échec en clair, « Réessayer » (essais restants), lien vers le téléphone simulé      |
| `components/orders/CancelOrderForm.tsx`                       | Annulation en deux temps (avertit si une demande attend sur le téléphone)                                                    |
| `lib/orders/api-orders.ts`, `orders.ts`                       | Adaptateur `server-only` (clé interne + jeton), réponses vérifiées par le contrat ; journaux sans numéro ni jeton            |
| `lib/orders/order-actions.ts`, `order-messages.ts`            | Actions serveur (devis, commande, réessai, annulation) ; messages en français pour chaque code                               |

### 5.13 Démonstration du premier achat (S5-T08)

Décision : [ADR-0030](adr/0030-demo-premier-achat-ci-allegee.md). Là où le bac à sable existe (`APP_ENV` = `local`, `e2e`, `demo`),
le layout affiche un bandeau (`components/layout/DemoBanner.tsx` : « aucun vrai paiement », lien vers `/demo`) et la page
`app/demo/page.tsx` explique le parcours en 4 étapes (compte, achat et `DEMO10`, téléphone simulé, facture). Ailleurs : ni bandeau,
ni page (404). Non indexée.

### 5.14 Photos des vendeurs (S6-T04)

Décision : [ADR-0035](adr/0035-photos-produits-vendeurs.md). `app/images/v/[file]/route.ts` relaie la photo demandée à l'API
(`lib/catalog/api-vendor-image.ts`, clé interne et adresse du visiteur) et ne renvoie qu'un WebP vérifié (type, en-tête, 2 Mo),
en cache 60 s (+ 5 min pendant la mise à jour). `components/ui/ProductImage.tsx` remplace `next/image` partout : photos du catalogue
Kemdia par l'optimiseur comme avant ; photos des vendeurs **sans** optimiseur (il les garderait 24 h, même retirées), vignette de
480 px dans les listes, grande image sur la fiche. `images.localPatterns` est limité aux dossiers fixes (`/images/products`,
`/images/categories`, `placeholder.svg`). Les aperçus de partage (OpenGraph) n'affichent pas encore les photos des vendeurs.

### 5.15 Espace de l'équipe (S6-T05)

Décision : [ADR-0036](adr/0036-ecrans-equipe.md). Pages sous `/equipe` (jamais indexées), pour les modérateurs et les
administrateurs :

| Page                         | Pour                         | Contenu                                                                                      |
| ---------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------- |
| `/equipe`                    | équipe                       | Tableau de bord : produits à modérer, demandes de boutique (administrateurs)                 |
| `/equipe/securite`           | équipe (sans 2FA confirmée)  | Activation de la 2FA (mot de passe → QR code → premier code → codes de secours), état, codes |
| `/equipe/confirmer?retour=…` | équipe (2FA activée)         | Code de l'application ou code de secours, puis retour à la page demandée                     |
| `/equipe/boutiques[/id]`     | administrateurs              | Boutiques par statut ; valider, refuser, suspendre, réactiver (motif obligatoire)            |
| `/equipe/moderation[/id]`    | modérateurs, administrateurs | File (la plus ancienne d'abord) ; fiche avec photos, catégorie, variantes ; valider, refuser |

```
Page de l'équipe ─► garde (lib/staff/staff.ts) : connecté ? équipe ? 2FA activée ? confirmée < 15 min ?
   └─► adaptateur (lib/staff/api-staff.ts) ─► API : rôle + 2FA revérifiés à chaque appel (ADR-0034)
Décision (formulaire HTML) ─► action serveur (arguments revérifiés) ─► API ─► redirection avec un code de liste fermée
Photo à modérer ─► /equipe/moderation/{produit}/photos/{photo} ─► API avec le jeton ─► WebP vérifié, jamais en cache
```

Le QR code est calculé sur le serveur (`lib/staff/qr.ts`, bibliothèque `uqr`) : le navigateur reçoit un simple tracé SVG. Les
décisions sont de simples formulaires HTML : aucun JavaScript en plus, elles marchent même sans. Un modérateur ou un
administrateur trouve le lien « Ouvrir l'espace de l'équipe » dans « Mon compte ».

### 5.16 Espace vendeur (S6-T06)

Décision : [ADR-0037](adr/0037-espace-vendeur.md). Pages sous `/vendeur` (jamais indexées), pour tout compte connecté :

| Page                                 | Contenu                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/vendeur`                           | Selon la boutique : demande, demande en cours, refus (motif + nouvelle demande), suspension, tableau de bord                                         |
| `/vendeur/produits[?statut=…]`       | Produits par statut (en ligne, en attente, refusés, retirés), du plus récent au plus ancien                                                          |
| `/vendeur/produits/nouveau`          | Fiche et variantes (1 à 20) ; part en modération                                                                                                     |
| `/vendeur/produits/{id}`             | État de la modération et motif, photos, prix et stock par variante, fiche, retrait / remise en vente                                                 |
| `/vendeur/commandes[?statut=…]`      | Commandes de la boutique (« À traiter » d'abord) : statut, montant de ses articles, ville, échéance (S6-T07)                                         |
| `/vendeur/commandes/{référence}`     | Ses articles, échéance ; accepter, ou refuser avec motif (la commande entière est annulée) (S6-T07) ; état de la livraison en lecture seule (S7-T02) |
| `/vendeur/verification`              | Dossier de vérification (identité, RCCM, compte de versement), photos réduites dans le navigateur, envoi (S6-T08)                                    |
| `/equipe/verifications[/{boutique}]` | Équipe (administrateurs) : file des dossiers envoyés, dossier et photos (journal d'audit), valider / refuser (S6-T08)                                |
| `/equipe/livraisons[?statut=…]`      | Équipe (administrateurs) : commandes prêtes (« Remettre au transporteur »), expéditions par statut (S7-T02)                                          |
| `/equipe/livraisons/{n°}`            | Frais et parts (BR-021), étapes ; livrée, échec (motif), nouvelle tentative, annulation (note) (S7-T02)                                              |
| `/equipe/livraisons/bareme`          | Barème des 4 zones : frais de base, livraison offerte dès, délais (S7-T02)                                                                           |

```
Photo choisie ─► navigateur : réduite à 1 600 px (JPEG 85) ─► POST /vendeur/produits/{id}/photos (route du site)
   └─► session vérifiée, 5 Mo lus au plus, type lu dans les octets ─► API (jeton) : réencodage WebP, modération
Aperçu ─► /vendeur/produits/{id}/photos/{photo} ─► API avec le jeton ─► WebP vérifié, jamais en cache
```

`/vendre` reste la page de présentation : son bouton « Devenir vendeur » mène à `/vendeur` (connexion demandée). Aucun taux de
commission n'y est annoncé tant que le client n'a pas répondu (question ouverte n° 3).

### 5.17 Barème de livraison du site (S7-T02)

Décision : [ADR-0041](adr/0041-livraisons-ecrans.md). Le serveur du site lit `GET /shipping/tariffs` et garde le barème
**5 minutes** en mémoire ; ensuite, il rend la valeur gardée tout de suite et la relit en arrière-plan. Seule la toute
première lecture attend (1 s au plus), puis prend le barème du contrat. Le layout le transmet aux composants du
navigateur (`DeliveryTariffsProvider`, `useDeliveryEstimate`) : fiche produit, panier, choix de la ville, caisse, page
« Livraison ». Une estimation : le devis de l'API fait foi au paiement. La commande du client montre une section
« Livraison » (`GET /orders/{n°}/shipment`) dès la remise au transporteur.

## 6. Sécurité

### 6.1 Principes

1. **Ne jamais faire confiance au client** : URL, formulaires, `localStorage`, en-têtes sont validés.
2. **Le serveur calcule tous les montants.**
3. **Aucun secret, aucune donnée réelle dans Git.**
4. **Moindre privilège** : conteneur non-root, système de fichiers en lecture seule, rôles stricts (S4-T06 : client, vendeur, modérateur, administrateur).
5. **Défense en profondeur** : validation + échappement + CSP + en-têtes.

### 6.2 Mesures en place (S1)

| Mesure                                                                                                                                         | Où                                       | Faille(s) de l'ancien projet évitée(s)    |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| Content-Security-Policy, X-Frame-Options, HSTS, Referrer-Policy, Permissions-Policy, nosniff                                                   | `next.config.ts`                         | LOW-03                                    |
| CSP à nonce (S4-T07) : `script-src 'nonce-…' 'strict-dynamic'`, nonce neuf à chaque requête, plus de `'unsafe-inline'` pour les scripts        | `proxy.ts`, `lib/security/csp.ts`        | LOW-03, CRIT-04 (XSS)                     |
| CSRF (S4-T07) : toute requête qui modifie quelque chose doit venir du site (`Origin`, `Sec-Fetch-Site`), même sans `Origin`, sur toute adresse | `proxy.ts`, `lib/security/origin.ts`     | HIGH-16                                   |
| Adresse du visiteur transmise à l'API seulement selon `CLIENT_IP_HEADER` ; `X-Forwarded-For` : dernière adresse ; valeur validée (S4-T07)      | `lib/security/client-ip.ts`              | MED-05, usurpation d'adresse              |
| En-tête `X-Powered-By` supprimé                                                                                                                | `next.config.ts`                         | Empreinte technologique                   |
| React échappe tout texte ; aucun `innerHTML` sur des données                                                                                   | Tous les composants                      | CRIT-04 (XSS)                             |
| Tri/page/recherche validés par liste blanche et bornes                                                                                         | `lib/search-params.ts`                   | MED-13                                    |
| Filtres (prix, marque, stock, promo, note) : valeurs connues uniquement, marques comparées au catalogue                                        | `lib/filters.ts`                         | MED-13                                    |
| Commande : seuls identifiants + quantités envoyés (aucun montant) ; numéro de paiement vérifié selon l'opérateur                               | `lib/checkout.ts`                        | CRIT-01, HIGH-05                          |
| Optimiseur d'images limité à `/images/**` (URL externes refusées : 400)                                                                        | `next.config.ts`                         | HIGH-03 (SSRF)                            |
| `localStorage` validé champ par champ                                                                                                          | `lib/cart.ts`, `LocationProvider`        | Altération du panier                      |
| Ville choisie dans une liste fermée, aucune redirection construite depuis l'URL                                                                | `LocationModal`                          | MED-01, MED-06, MED-14                    |
| Code catalogue `server-only`                                                                                                                   | `lib/catalog/`                           | Fuite de logique côté client              |
| Catalogue (S3-T05) : réponses de l'API validées par le contrat, délai maximal, slug vérifié avant l'appel, jamais de repli silencieux          | `lib/catalog/api-catalog.ts`             | Données altérées, SSRF, faux prix         |
| Configuration du site vérifiée au démarrage : production sans API refusée, clé interne obligatoire, adresse sans identifiants (S3-T05)         | `lib/config/`, `instrumentation`         | CRIT-02, mauvais réglage                  |
| `.gitignore` : `.env*`, `*.sqlite3`, dumps                                                                                                     | racine                                   | CRIT-02, CRIT-03, CRIT-05, LOW-02         |
| Gitleaks (historique complet), pnpm audit, CodeQL, Dependabot, Trivy                                                                           | CI                                       | CRIT-02, HIGH-07                          |
| Pages d'erreur sans détail technique                                                                                                           | `error.tsx`                              | Fuite d'informations                      |
| Adresse de retour après connexion limitée aux chemins internes (`parseReturnTo`)                                                               | `lib/search-params.ts`                   | MED-01 (redirection ouverte)              |
| Messages identiques que le compte existe ou non (connexion, mot de passe oublié)                                                               | `components/auth/`                       | Énumération des comptes                   |
| Mot de passe : 8 caractères min., lettre + chiffre, liste des plus courants refusée ; jamais stocké dans le navigateur, effacé après envoi     | `lib/auth/validation.ts`                 | Mots de passe faibles                     |
| Code OTP : 5 essais max. puis nouveau code obligatoire, renvoi après 60 s — appliqués par l'API (S4-T02)                                       | API `identity`                           | MED-05, MED-10                            |
| Jeton de session et tickets dans des cookies `__Host-` `HttpOnly` `Secure` `SameSite=Lax`, jamais dans la page ni l'adresse (S4-T05)           | `lib/auth/cookies.ts`, `actions.ts`      | Vol de session (XSS), fixation de session |
| Actions serveur : arguments revérifiés (type, longueur, format), origine contrôlée par Next.js ; aucun secret renvoyé ni journalisé (S4-T05)   | `lib/auth/actions.ts`, `api-identity.ts` | Requêtes forgées, fuite de jeton          |
| Adresse de retour résolue comme le navigateur (`.`/`..`), jamais vers une page d'identité (S4-T05)                                             | `lib/search-params.ts`                   | MED-01                                    |
| Attributs `autocomplete` corrects (gestionnaires de mots de passe, code SMS auto-rempli)                                                       | Formulaires                              | Mots de passe réutilisés                  |

Le suivi détaillé des 45 failles est dans [`docs/securite/heritage-audit-django.md`](../securite/heritage-audit-django.md).

### 6.3 Sécurité de l'API (S3-T01)

| Mesure                                                                                                                                                                                                                                              | Où                                                                                        | Faille(s) de l'ancien projet évitée(s)                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Configuration validée au démarrage ; valeurs jamais affichées ; `debug` interdit en production                                                                                                                                                      | `config/env.ts`                                                                           | CRIT-02 (secrets), mauvaise config                             |
| CSP `default-src 'none'; frame-ancestors 'none'`, HSTS, `nosniff`, `X-Frame-Options: DENY`, sans `X-Powered-By`                                                                                                                                     | `http/configure-app.ts`                                                                   | LOW-03, empreinte technologique                                |
| CORS fermé par défaut ; origines explicites, HTTPS en production                                                                                                                                                                                    | `http/configure-app.ts`                                                                   | Appels depuis un site tiers                                    |
| Corps JSON limité à 100 Ko                                                                                                                                                                                                                          | `http/configure-app.ts`                                                                   | Déni de service                                                |
| Erreurs imprévues : message générique (détail dans les journaux) ; 404 sans recopier l'adresse                                                                                                                                                      | `http/problem-details.filter.ts`                                                          | Fuite d'informations, XSS réfléchie                            |
| Journaux sans paramètres d'URL, sans corps ni en-têtes ; champs sensibles masqués ; identifiant de requête                                                                                                                                          | `http/logging.ts`                                                                         | Données personnelles dans les journaux                         |
| Couches et modules isolés (test d'architecture)                                                                                                                                                                                                     | `test/architecture.test.ts`                                                               | Couplage, contournement des règles                             |
| `DATABASE_URL` jamais journalisée ; mot de passe masqué dans les messages du pilote ; adresse de développement refusée en production (S3-T02)                                                                                                       | `config/env.ts`, `database/`                                                              | CRIT-02 (identifiants exposés)                                 |
| Requêtes SQL paramétrées (Prisma), testé avec une valeur hostile ; requête limitée à 10 s ; ≤ 10 connexions (S3-T02)                                                                                                                                | `database/prisma.service.ts`, test d'intégration                                          | CRIT-04 (injection), déni de service                           |
| Recherche : mots réduits à `[a-z0-9]`, 8 mots et 100 caractères au plus ; pages de 48 au plus ; 10 marques au plus (S3-T03)                                                                                                                         | `catalog/application/product-search.ts`                                                   | MED-13, déni de service                                        |
| Contraintes SQL : prix > 0, prix barré > prix, stock ≥ 0 ; catégorie non supprimable si elle contient des produits ; déclencheur : 3 niveaux au plus et aucune boucle (BR-005) (S3-T03)                                                             | migration `catalogue`                                                                     | Montants et stocks incohérents                                 |
| Images de produits : chemins `/images/…` uniquement, jamais d'adresse externe (S3-T03)                                                                                                                                                              | `catalog/domain/category.ts`                                                              | HIGH-03 (SSRF)                                                 |
| Tests d'intégration limités aux bases `*_test` (ils vident des tables) (S3-T03)                                                                                                                                                                     | `test/integration-db.ts`                                                                  | Perte de données de développement                              |
| Limitation de débit par IP (120/min, 30/min pour la disponibilité), 429 en français + `Retry-After` ; clé interne du site comparée en temps constant (S3-T04)                                                                                       | `http/rate-limit.ts`                                                                      | Déni de service, force brute                                   |
| Limites par visiteur (adresse transmise par le site, crue seulement avec la clé ; IPv6 par /64) et par compte sur chaque route connectée ; code `TROP_DE_REQUETES` (S4-T07)                                                                         | `http/client.ts`, `rate-limit.ts`, `identity/interface/session.guard.ts`                  | MED-05 (pas de limitation), force brute distribuée             |
| Image de l'API : non-root, lecture seule, sans npm ; moteur de migrations téléchargé à la construction ; scannée par Trivy ; migrations refusées si la configuration est fausse (S3-T06)                                                            | `apps/api/Dockerfile`, `database/migrate.ts`                                              | Image vulnérable, base de développement en production          |
| Corps de requête validés par schéma, champs inconnus refusés (S3-T04)                                                                                                                                                                               | `packages/contracts/src/schemas.ts`                                                       | Injection de champs (ex. un prix envoyé par le client)         |
| Page de documentation : fichiers servis par l'API (liste fermée), CSP propre, désactivée par défaut en production ; télémétrie `@scarf/scarf` bloquée (S3-T04)                                                                                      | `docs/`                                                                                   | Script tiers, fuite d'informations                             |
| Base locale accessible seulement depuis le poste (`127.0.0.1`), authentification SCRAM-SHA-256 (S3-T02)                                                                                                                                             | `docker-compose.yml`                                                                      | Base exposée sur le réseau                                     |
| Mots de passe hachés en Argon2id (OWASP) ; règles vérifiées par le serveur (S4-T01) : 8 à 128 caractères, **aucune règle de composition**, 10 000 mots de passe courants refusés ; changement avec le mot de passe actuel (S7-T07, ASVS 5.0)        | `identity/domain/password-policy.ts`, `common-passwords.ts`, `password-change.service.ts` | Mots de passe devinables, prise de compte par session volée    |
| Codes à usage unique : tirage cryptographique, empreinte seulement, 10 min, 5 essais, dernier code seul valable, 60 s et 5 par heure (S4-T01)                                                                                                       | `identity/domain/otp.ts`, `otp.service.ts`                                                | HIGH-11 (vérification contournable), force brute               |
| Connexion sans énumération : blocage BR-040 compté par identifiant (compte ou pas), hachage factice, même message ; essai réservé avant la vérification (S4-T03)                                                                                    | `identity/application/login.service.ts`, `login_guards`                                   | MED-10 (pas de verrouillage), force brute, énumération         |
| Sessions : jeton de 256 bits, empreinte seulement, 30 jours glissants, révocation immédiate, comptes désactivés exclus (S4-T03)                                                                                                                     | `identity/application/session.service.ts`                                                 | Sessions volées ou impossibles à fermer                        |
| Mot de passe oublié sans énumération (même réponse, aucun e-mail sans compte) ; ticket + code ; changement en une transaction : toutes les sessions fermées, blocage levé, avis au titulaire ; version du mot de passe dans chaque session (S4-T04) | `identity/application/password-reset.service.ts`, `reset_tickets`                         | Prise de compte, sessions survivant au changement, énumération |
| Inscription sans énumération : même réponse, mêmes limites, même durée (hachage systématique) si l'adresse a un compte ; alerte au titulaire (S4-T02)                                                                                               | `identity/application/signup.service.ts`                                                  | Énumération des comptes                                        |
| Essais de code comptés en une requête, limites d'envoi sous verrou par adresse : des demandes simultanées ne les contournent pas (S4-T02)                                                                                                           | `identity/infrastructure/prisma-otp-challenge.repository.ts`                              | Force brute en parallèle, bombardement d'e-mails               |
| Ticket d'inscription (empreinte seulement) portant l'inscription ; compte créé au bon code : une deuxième inscription ne peut pas faire valider son mot de passe par le titulaire (S4-T02)                                                          | `identity/domain/signup-ticket.ts`                                                        | Détournement d'inscription                                     |
| E-mails sans lien ni image, sans donnée saisie ; clé Brevo jamais journalisée, erreurs réduites au statut HTTP (S4-T02)                                                                                                                             | `identity/infrastructure/email/`                                                          | Hameçonnage, injection, fuite de secret                        |
| Jamais de code écrit dans les journaux hors du poste de développement ; SMS refusé tant que `SMS_ENABLED=false` (S4-T01)                                                                                                                            | `identity/infrastructure/otp-sender.factory.ts`                                           | Fuite de codes, coûts imprévus                                 |
| Rôles : seul un administrateur accorde `vendor` / `moderator` ; `admin` jamais par l'API ; jamais sur soi (aussi en SQL) ; UUID comparés sans casse ; statut du compte relu sous verrou (S4-T06)                                                    | `identity/domain/role.ts`, `role.service.ts`, migration                                   | CRIT-06 (élévation), MED-07 (pas de hiérarchie)                |
| `@Authorize` fermée par défaut ; règles du contrôleur et de la méthode toutes exigées ; rôles relus à chaque requête ; administration : connexion de moins de 15 minutes (S4-T06)                                                                   | `identity/interface/role.guard.ts`                                                        | Routes oubliées, rôle retiré encore utilisable, session volée  |
| Journal d'audit en ajout seul (déclencheurs SQL), date posée par la base, écrit dans la transaction de l'action, sans secret ; conservé 365 jours (S4-T06)                                                                                          | `modules/audit`, migration `roles_journal_audit`                                          | Actions sans trace, effacement de traces, MED-18               |
| Premier administrateur par commande serveur sur un compte vérifié ; aucun mot de passe par défaut ; erreurs sans détail technique (S4-T06)                                                                                                          | `src/cli/admin-role.ts`                                                                   | CRIT-02 (secrets), compte par défaut                           |

### 6.4 Prévu 🔜

- Démo : régler `CLIENT_IP_HEADER` une fois l'en-tête fiable de Render vérifié ; collecte des violations de CSP (`report-to`).
- S5 : signature des webhooks Mobile Money, idempotence des paiements. Fait au S5-T01 : panier modifié sous verrou en une transaction, prix jamais reçus du navigateur, UUID normalisés. Fait au S5-T02 : stock réservé dans la transaction de la commande (BR-012), commandes idempotentes, montants figés par la base, 3 commandes ouvertes au plus par compte. Fait au S5-T03 : coupons comptés de façon atomique (BR-030), jamais de commande à 0 FCFA, limite d'essais de codes. Fait au S5-T06 : factures figées et numérotées sans trou par la base, PDF jamais en erreur sur un texte du client, e-mail réservé avant l'envoi (pas de doublon), aucune facture « à compléter » en production. Fait au S5-T05 : notifications signées (HMAC-SHA256 sur le corps brut, 5 minutes), rejeu ignoré dans la même transaction (CRIT-01 traité), opérateur simulé jamais actif en production. Fait au S5-T07 : aucun article ni prix envoyé par le site, montants du devis seulement, Mobile Money refusé sans fournisseur, demandes de paiement expirées à l'annulation par le client, factures relayées par le serveur du site (session, numéros revérifiés, jamais en cache, 2 Mo au plus), actions serveur revérifiant chaque argument. Fait au S5-T04 : résultat d'un paiement vérifié (référence, montant), argent non attendu → remboursement à faire, commande payée non annulable en ligne, 5 demandes par heure au plus vers un même numéro, paiements et remboursements jamais effacés.
- S6 : espace vendeur fait au S6-T06 : produits seulement avec une boutique active (l'API reste juge), identifiants vérifiés avant toute adresse, montants entiers (le point seulement en milliers), stock jamais écrasé, photos réduites dans le navigateur puis lues en flux (5 Mo, session vérifiée avant, 4 envois à la fois, type lu dans les octets, corps borné à 6 Mo par Caddy), aperçus sans cache, retrait de photo confirmé, données de test refusées hors CI et atomiques. S6 : écrans d'administration faits au S6-T05 (double authentification, boutiques, modération) : garde côté site en plus de l'API, adresse de retour limitée à l'espace de l'équipe, secret et codes de secours jamais dans une adresse ni un cookie, QR code calculé sur le serveur, décisions en liste fermée, photos à modérer relayées sans cache (404 sans session), session refusée oubliée (pas de boucle), données de test d'administrateur refusées hors CI ; restent à l'écran : rôles, journal, coupons, réglages ; photos des vendeurs faites au S6-T04 : format reconnu par le contenu, réencodage WebP sans métadonnées (GPS), 40 mégapixels et 15 s au plus, 2 réencodages et 6 envois à la fois, photo publique seulement pour un produit visible, vignette tirée de l'image vue par la modération, empreintes au journal, jamais par l'optimiseur de Next.js ; double authentification (MED-15) faite au S6-T03 : TOTP obligatoire pour l'équipe, confirmation par session (15 min), secrets chiffrés, codes de secours, essais limités sur 15 min et 24 h, avis au titulaire, remise à zéro qui invalide le mot de passe ; nouvelles actions au journal (KYC, modération). Fait au S6-T02 : produits des vendeurs invisibles jusqu'à la validation, validation de la seule version lue (`PRODUIT_MODIFIE`), jamais sur sa propre boutique, boutique suspendue = produits cachés partout (y compris la réservation du stock), stock jamais écrasé (`previousStock`), textes invisibles refusés, panier sans titre non modéré, file bornée, prix et stock tracés. Fait au S6-T01 : une boutique par compte (verrou par compte), nom unique sans casse ni accents et signes ressemblants confondus, lettres ASCII et accentuées du français seulement, « Kemdia » interdit même déguisé (pas d'usurpation), nom libéré au refus, motifs et demandes au journal, caractères invisibles retirés, personne ne décide pour sa propre boutique, boutique + rôle + journal dans une transaction, mêmes règles en contraintes SQL.
- S7 : deux rôles PostgreSQL (migrations / application sans droit de modifier les tables **ni de désactiver les déclencheurs du journal d'audit**), connexion chiffrée selon l'hébergement, sauvegardes chiffrées testées.

## 7. DevOps — CI/CD

```mermaid
flowchart LR
    dev[Poste développeur] -->|commit| hook[pre-commit<br/>Prettier]
    hook -->|PR| ci
    subgraph ci[CI — chaque PR et main]
      direction TB
      q[format · lint · types · tests · build]
      d[API : migrations + intégration<br/>PostgreSQL 18 éphémère]
      e[parcours de bout en bout<br/>accessibilité · budget de performance]
      i[images Docker site + API<br/>scan Trivy · démarrage vérifié]
      s[Gitleaks · pnpm audit · Semgrep · ShellCheck]
      z[OWASP ZAP : site + API, 4 rôles<br/>passif PR · actif chaque semaine]
    end
    ci -->|fusion main| pub[(GHCR web:sha-…)]
    pub -->|auto, si TOUT est vert| stg[STAGING + test de fumée]
    stg -->|tag vX.Y.Z| rel[Release : même image → web:vX.Y.Z]
    rel --> prod[PRODUCTION + test de fumée]
    prod -. échec .-> rb[retour arrière auto]
```

| Fichier                           | Rôle                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/ci.yml`        | Depuis le S7.5-T01 (ADR-0048) : qualité, base, bout en bout, pile serveur et images **en même temps** ; publication GHCR + Docker Hub (main) ; staging et démo **seulement si tous ces jobs sont verts** ; étiquettes `main` et `latest` posées après validation                                                                                                                                                                                                       |
| `.github/workflows/release.yml`   | Tag `vX.Y.Z` → **CI/CD du commit terminée et verte** (S7.5-T01) → promotion de l'image testée → Release GitHub → production                                                                                                                                                                                                                                                                                                                                            |
| `.github/workflows/_deploy.yml`   | Déploiement réutilisable : SSH restreint, test de fumée, retour arrière                                                                                                                                                                                                                                                                                                                                                                                                |
| `.github/workflows/security.yml`  | Gitleaks, pnpm audit, Semgrep, ShellCheck ; CodeQL si dépôt public ; chaque lundi                                                                                                                                                                                                                                                                                                                                                                                      |
| `.github/workflows/zap.yml`       | Test d'intrusion OWASP ZAP 2.17.0 sur la pile serveur (S7-T07, ADR-0046) : site et API (OpenAPI) en anonyme, client, vendeuse, administratrice ; passif à chaque PR, actif chaque dimanche ; moyen ou élevé = rouge ; revue ASVS : `docs/securite/asvs-5.0-niveau1.md` ; depuis le S7.5-T01 : rapport partiel = rouge, jetons retirés des artefacts                                                                                                                    |
| `.github/dependabot.yml`          | Mises à jour hebdomadaires (npm, actions épinglées par SHA, image Docker)                                                                                                                                                                                                                                                                                                                                                                                              |
| `apps/web/Dockerfile`             | Multi-étapes, `standalone`, non-root, sans npm, healthcheck `/api/health`                                                                                                                                                                                                                                                                                                                                                                                              |
| `apps/api/`                       | Lint, types, tests (avec couverture) et build dans la même étape « qualité » que le site (S3-T01)                                                                                                                                                                                                                                                                                                                                                                      |
| Job « migrations et intégration » | Base PostgreSQL 18 éphémère : `db:deploy`, `db:check` (migrations = schéma), `test:int` (S3-T02)                                                                                                                                                                                                                                                                                                                                                                       |
| Job « bout en bout » (S3-T05)     | Site construit avec une API **injoignable**, puis parcours et performance contre la vraie API (PostgreSQL 18, clé éphémère) ; aucune réponse 429 tolérée. Depuis le S5-T07 : API en `APP_ENV=demo` (opérateur simulé, factures) pour le premier achat complet (`E2E_SANDBOX`). Depuis le S6-T05 et le S6-T06 : données de test de l'équipe et des vendeurs (`e2e/fixtures/equipe-e2e.sql`, `vendeur-e2e.sql`, refusées sans `PGOPTIONS='-c kemdia.e2e=on'`, atomiques) |
| Job « Ce qui a changé » (S5-T08)  | Une PR qui ne touche que `docs/**` ou `*.md` saute base de données, bout en bout et images (sautés = réussis) ; renommage, nom bizarre, API en panne, liste tronquée → tout tourne ; `main` et lancement manuel : tout tourne                                                                                                                                                                                                                                          |
| `apps/api/Dockerfile` (S3-T06)    | Image de l'API : multi-étapes, dépendances de production seules, non-root, moteur de migrations embarqué                                                                                                                                                                                                                                                                                                                                                               |
| Job « image de l'API » (S3-T06)   | Construction, Trivy, migrations sur une base **vide** puis relance, refus d'une configuration fausse, API en lecture seule → `database: ok`, publication GHCR (main)                                                                                                                                                                                                                                                                                                   |
| Job « image de l'API » (S3-T07)   | Démarrage de démo sur une base **vide** (migrations + 50 produits + API), redémarrage sans doublon, refus hors démo ; publication Docker Hub publique (main)                                                                                                                                                                                                                                                                                                           |
| Job « démo » (S3-T07)             | Render : API d'abord (version + `database: ok`), puis site (version, en-têtes, fiche produit, `catalog: "api"`) ; chaque partie ignorée sans son deploy hook                                                                                                                                                                                                                                                                                                           |
| Job « image » (S3-T05, S3-T08)    | Sans API, l'image refuse de démarrer (production comme démo) ; API muette → page d'erreur (500), jamais de catalogue de secours                                                                                                                                                                                                                                                                                                                                        |
| `deploy/`                         | Scripts et configuration serveur (voir §8)                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `.husky/pre-commit`               | Formatage automatique avant chaque commit                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Principes** : _build once, deploy many_ · déploiement par digest immuable · actions épinglées par SHA ·
aucun secret dans Git · tout changement passe par une PR.
**Stratégie de branches** : `main` toujours déployable ← PR depuis `feature/Sx-Tyy-description`.
Voir [`workflow-git.md`](../guides/workflow-git.md) et [`deploiement.md`](../guides/deploiement.md).

## 8. Déploiement

Décision : [ADR-0005](adr/0005-strategie-deploiement.md).

```mermaid
flowchart TB
    internet((Internet)) -->|80/443| caddy
    subgraph vps[VPS Ubuntu 24.04 — UFW 22/80/443, Fail2ban, MAJ auto]
      caddy[Caddy<br/>HTTPS Let's Encrypt]
      subgraph edge[réseau Docker « edge » — aucun port publié]
        prod[kemdia-production-web]
        stg[kemdia-staging-web<br/>mot de passe + noindex]
      end
      prod -->|app| papi[production-api] -->|private, sans Internet| pdb[(production-db)]
      stg -->|app| sapi[staging-api] -->|private, sans Internet| sdb[(staging-db)]
      caddy -->|kemdia.ga| prod
      caddy -->|staging.kemdia.ga| stg
      deploy[/opt/kemdia/bin/deploy.sh/]
    end
    gha[GitHub Actions] -->|SSH clé restreinte<br/>forced command| deploy
    deploy -->|pull par digest| ghcr[(GHCR)]
```

| Élément              | Choix                                                                                                                                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hébergement          | VPS Ubuntu 24.04 (2 vCPU / 4 Go), Europe de l'Ouest — à réévaluer avec l'APDPVP pour les données personnelles (S7)                                                                                                         |
| Conteneur applicatif | Lecture seule, `cap_drop: ALL`, `no-new-privileges`, 512 Mo max, logs bornés                                                                                                                                               |
| Environnements       | `demo` (Render Free, public, auto à chaque fusion) · `staging` (auto, protégé) · `production` (tag de version)                                                                                                             |
| Proxy (Caddy)        | HTTPS Let's Encrypt ; **corps de requête borné à 6 Mo** (S6-T06 : une photo de vendeur fait 5 Mo au plus)                                                                                                                  |
| Fiabilité            | Healthcheck, `compose up --wait`, test de fumée, retour arrière automatique, verrou anti-déploiements concurrents                                                                                                          |
| Traçabilité          | Release GitHub par version, résumé de chaque déploiement dans Actions, `/opt/kemdia/deploy.log`                                                                                                                            |
| Base de données      | PostgreSQL 18 ([§3.5](#35-base-de-données-s3-t02)) : démo sur **Neon Free** (S3-T07) ; serveur : **un conteneur par environnement**, réseau privé sans Internet (S7-T04)                                                   |
| API                  | Image sur GHCR et Docker Hub (public) à chaque fusion (§3.8) ; démo sur Render Free (S3-T07) ; **serveur : déployée avec le site, migrations avant la bascule** (S7-T04)                                                   |
| Secrets du serveur   | Tirés sur le serveur par `init-secrets.sh` (S7-T04) : `/opt/kemdia/secrets/<env>.{db,api,web}.env`, 0640, jamais remplacés ; le site ne reçoit pas les clés de chiffrement                                                 |
| Images acceptées     | Seulement depuis le dépôt déclaré dans `/opt/kemdia/deploy.conf` (root), par digest (S7-T04)                                                                                                                               |
| Vérification         | Job CI « Pile serveur » : Caddy + site + API + PostgreSQL déployés par le vrai `deploy.sh` à chaque PR (S7-T04)                                                                                                            |
| Sauvegardes          | restic chaque nuit (S7-T05, [ADR-0044](adr/0044-sauvegardes-restic.md)) : bases, secrets et Caddy, chiffrés (AES-256), locales + copie S3, 7/4/6 ; restauration vérifiée le dimanche et perte du serveur rejouée en CI     |
| Surveillance         | UptimeRobot (extérieur, `/api/health?complet=1`) + `monitor.sh` toutes les 5 min vers Healthchecks.io, alerte aussi sur silence (S7-T06, [ADR-0045](adr/0045-surveillance-alertes.md)) ; journaux JSON du site et de l'API |
| À venir              | _blue/green_ sans coupure                                                                                                                                                                                                  |

### Démo publique (S3-T07)

Décision : [ADR-0013](adr/0013-demo-render-api-neon.md). Guide pas à pas : [demo-gratuite.md](../guides/demo-gratuite.md).

```mermaid
flowchart LR
    v((Visiteur)) -->|HTTPS| web[Render Free — kemdia<br/>image levy2025/kemdia]
    web -->|HTTPS public + x-kemdia-internal-key| api[Render Free — kemdia-api<br/>image levy2025/kemdia-api<br/>start-demo.js]
    api -->|TLS, connexion directe| neon[(Neon Free<br/>PostgreSQL 18 — Francfort)]
    gha[GitHub Actions] -->|1. hook + digest| api
    gha -->|2. hook + digest| web
```

| Élément            | Valeur                                                                                                                               |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Démarrage de l'API | Docker Command `node dist/database/start-demo.js` : migrations → import de démonstration (~1 s) → API ; échec → l'API ne démarre pas |
| Secrets            | `DATABASE_URL`, `API_INTERNAL_KEY` : variables des services Render ; GitHub ne connaît que les deploy hooks                          |
| Veille             | Site et API s'endorment après 15 min ; le site réveille l'API à son démarrage ; délai du catalogue 60 s sur la démo                  |
| Limites            | Première visite après une pause : 1 à 2 min ; API publique (pas de réseau privé en gratuit) ; `TRUST_PROXY=0`                        |

### 8.1 En ligne depuis le PC du développeur (S6-T00)

Décision : [ADR-0031](adr/0031-en-ligne-docker-tunnel.md) ; guide : [en-ligne-docker.md](../guides/en-ligne-docker.md).
Pour des tests à distance sans hébergeur : `deploy\windows\en-ligne.ps1` construit les images de production sur le PC et démarre
le projet Compose `kemdia-en-ligne` (`deploy/en-ligne/compose.yml`) comme la démo Render (`APP_ENV=demo`), avec une base à part,
des e-mails Brevo et un tunnel rapide Cloudflare (`….trycloudflare.com`). Seul le site passe par le tunnel (réseau `edge`) ;
l'API et la base restent sur le réseau `backend`. `hors-ligne.ps1` coupe le tunnel d'abord ; `-Effacer` supprime la base des testeurs.

## 9. Qualité et tests

| Niveau              | Outil                                                 | État S1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unitaires (logique) | Vitest                                                | 78 tests : formatage, livraison (dont dates), panier, catalogue, paramètres d'URL, identité (S2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Composants          | Testing Library                                       | 16 tests : carte produit, saisie OTP, parcours d'identité, carrousel, barre d'onglets (S2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Bout en bout        | Playwright + axe-core                                 | 16 scénarios × 2 appareils (téléphone Pixel 7, ordinateur) : achat complet, filtres, favoris, partage, vendeur, en-têtes de sécurité, XSS, accessibilité WCAG AA de 7 pages (S2) ; **contre la vraie API** depuis le S3-T05                                                                                                                                                                                                                                                                                                                                                         |
| Performance         | Playwright + Web Vitals (Chrome DevTools)             | 5 pages, médiane de 3 chargements à froid en 3G : premier affichage, plus grand élément, décalages, blocage, poids ; tableau dans le résumé de la CI et annotations (S2-T08) ; **S3-T08** : budget commun pour l'accueil (blocage ≤ 300 ms, indicatif), mesure sans trace Playwright (elle gonflait le blocage) ; **S7-T03** : blocage de l'accueil **bloquant au-delà de 350 ms** (avertissement au-delà de 300 ms) ; **S8-T04** : processeur **étalonné** sur la vitesse de la machine (référence 20 ms), médiane de 5 chargements pour l'accueil, **bloquant au-delà de 300 ms** |
| Site — catalogue    | Vitest                                                | S3-T08 : 143 tests du site ; lecture du catalogue testée contre une **fausse API en mémoire** (sélections de l'accueil, ronds, tuiles, produits similaires, plan du site) ; configuration (refus sans API dans tout environnement) ; adaptateur HTTP (délai, 404, réponse hors contrat, cache, clé interne), garde de construction ; hydratation à la demande ; panier par variante (`kemdia.cart.v2`)                                                                                                                                                                              |
| Contrat partagé     | Vitest                                                | 8 tests (S3-T05) : schémas, OpenAPI, identifiants de démonstration stables ; l'API vérifie que ses règles (quantité maximale) sont celles du contrat                                                                                                                                                                                                                                                                                                                                                                                                                                |
| API (S3)            | Vitest + Supertest                                    | 134 tests (S3-T06 : script de migration — configuration vérifiée, aucune valeur affichée, échec et délai ; S3-T05 : paramètre `badge`, tri `ventes`, alignement sur le contrat ; S3-T04 : routes HTTP, contrat, limitation de débit, documentation OpenAPI ; dont 46 sur le catalogue : domaine, BR-001, recherche, import — S3-T03) : configuration, journaux, en-têtes de sécurité, CORS, format des erreurs, versionnement des routes, santé de la base, architecture du code et du schéma Prisma (S3-T01, T02)                                                                  |
| API — intégration   | Vitest + vraie base PostgreSQL 18                     | 35 tests (S3-T05 : badges, tri `ventes`, variante par défaut d'une liste), dont 6 de contrat HTTP sur la vraie base (S3-T04 : chaque catégorie, chaque produit, chaque page validés par leur schéma) et 21 sur le catalogue : listes, recherche, filtres, tri, compteurs **comparés à la logique du site**, BR-001, contraintes SQL, 3 niveaux de catégories (S3-T03) ; et : santé, schémas créés, requête trop longue interrompue, injection SQL, base injoignable → 503 sans fuite (S3-T02)                                                                                       |
| Démo (S3-T07)       | Vitest + CI (image réelle, base vide)                 | 9 tests unitaires de l'API (démarrage de démo : ordre, refus hors démo, arrêt sur échec ; import : environnements permis, aucune valeur affichée) et 3 du site (réveil de l'API) ; en CI, l'image démarre en mode démo sur une base **vide** (50 produits servis), redémarre sans doublon et refuse `APP_ENV=staging` ; après chaque fusion, la démo en ligne est vérifiée (versions, `database: ok`, `catalog: "api"`)                                                                                                                                                             |
| Statique            | ESLint (règles Next + React Hooks), TypeScript strict | ✅                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## 10. Glossaire

Explications détaillées, avec des exemples Kemdia : [concepts.md](concepts.md).

- **SSR / SSG** : rendu des pages sur le serveur, à la demande / à l'avance.
- **Server / Client Component** : composant React exécuté uniquement sur le serveur / aussi dans le navigateur.
- **CSP** : en-tête qui indique au navigateur quelles sources de scripts, styles, images sont autorisées.
- **CI/CD** : intégration continue (vérifications automatiques) / déploiement continu.
- **ADR** : _Architecture Decision Record_, fiche qui trace une décision et sa justification.
