# Revue OWASP ASVS 5.0 — niveau 1

S7-T07 ([ADR-0046](../architecture/adr/0046-test-intrusion-zap-asvs.md)). Version **5.0.0** (mai 2025). Les 70
exigences de niveau 1 viennent du fichier officiel
`OWASP_Application_Security_Verification_Standard_5.0.0_en.csv` (dépôt OWASP/ASVS, étiquette `v5.0.0`). Chaque
statut s'appuie sur du code, un test ou un document du dépôt, cité dans la colonne « Preuve ». La revue est à
refaire à chaque fin de sprint.

Légende : ✅ conforme · 🔧 corrigé pendant le S7-T07 · ➖ sans objet (la fonction n'existe pas dans Kemdia).

**Bilan : 53 ✅ · 5 🔧 · 12 ➖ · 0 écart ouvert.**

## V1 — Encodage et nettoyage

| Exigence | Statut | Preuve                                                                                                                                                |
| -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1.2.1   | ✅     | Rendu React (échappement par contexte) ; aucun HTML construit à la main ; Semgrep (règles React / Next.js) à chaque PR                                |
| V1.2.2   | ✅     | Segments d'URL encodés (`encodeURIComponent`, 21 appels dans `apps/web/src/lib`) ; aucune URL fournie par un utilisateur affichée en lien             |
| V1.2.3   | ✅     | JSON-LD : `JSON.stringify` + échappement de `<` (`app/produit/[slug]/page.tsx`) ; aucun autre script construit dynamiquement                          |
| V1.2.4   | ✅     | Prisma (requêtes paramétrées) ; `$queryRaw` en gabarits balisés seulement ; `$executeRawUnsafe` uniquement pour des points de sauvegarde à texte fixe |
| V1.2.5   | ✅     | Seul appel système : `migrate.ts` lance Prisma avec des arguments fixes (`spawn`, sans shell) ; scripts serveur : arguments validés (`deploy.sh`)     |
| V1.3.1   | ➖     | Aucun éditeur riche : descriptions en texte nettoyé (ADR-0033)                                                                                        |
| V1.3.2   | ✅     | Aucun `eval` ni `new Function` (recherche dans `apps/*/src`, `packages/*/src`)                                                                        |
| V1.5.1   | ➖     | Aucun XML lu                                                                                                                                          |

## V2 — Validation et logique métier

| Exigence | Statut | Preuve                                                                                                                       |
| -------- | ------ | ---------------------------------------------------------------------------------------------------------------------------- |
| V2.1.1   | ✅     | Règles de saisie dans le contrat partagé (`packages/contracts/src/schemas.ts`, zod) et `docs/architecture/regles-metier.md`  |
| V2.2.1   | ✅     | Chaque corps de requête est validé par son schéma (objets stricts, longueurs, formats, listes fermées) ; champ inconnu → 400 |
| V2.2.2   | ✅     | Validation par l'API (qui fait foi) ; celle du site n'est qu'une aide à la saisie                                            |
| V2.3.1   | ✅     | États contrôlés côté serveur : commande, paiement, livraison (ADR-0040), inscription et mot de passe oublié (ticket + code)  |

## V3 — Sécurité du navigateur

| Exigence | Statut | Preuve                                                                                                                                        |
| -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| V3.2.1   | ✅     | API : `nosniff` et CSP `default-src 'none'` (helmet) ; images et pièces KYC : type exact, `nosniff`, `default-src 'none'`, réencodées en WebP |
| V3.2.2   | ✅     | Textes affichés par React (nœuds de texte), jamais en HTML                                                                                    |
| V3.3.1   | ✅     | Cookies `__Host-`, `Secure`, `HttpOnly`, `SameSite=Lax` en production (`lib/auth/cookies.ts`)                                                 |
| V3.4.1   | ✅     | HSTS `max-age=63072000; includeSubDomains; preload` (`next.config.ts`)                                                                        |
| V3.4.2   | ✅     | CORS de l'API : liste fixe `CORS_ORIGINS`, adresses validées au démarrage (`config/env.ts`)                                                   |
| V3.5.1   | ✅     | Site : refus des requêtes qui modifient sans `Origin` du site ni `Sec-Fetch-Site: same-origin` (`proxy.ts`, `security/origin.ts`, ADR-0021)   |
| V3.5.2   | ✅     | Pas de dépendance au pré-vol CORS : l'API exige un jeton `Authorization: Bearer` (jamais envoyé seul par un navigateur)                       |
| V3.5.3   | ✅     | Toute action qui modifie passe par POST, PUT, PATCH ou DELETE (actions serveur de Next.js, routes de l'API)                                   |

## V4 — API et services web

| Exigence | Statut | Preuve                                                                                            |
| -------- | ------ | ------------------------------------------------------------------------------------------------- |
| V4.1.1   | ✅     | `application/json; charset=utf-8` (API), `text/html; charset=utf-8` (site), types d'images exacts |
| V4.4.1   | ➖     | Aucun WebSocket                                                                                   |

## V5 — Fichiers

| Exigence | Statut | Preuve                                                                                                          |
| -------- | ------ | --------------------------------------------------------------------------------------------------------------- |
| V5.2.1   | ✅     | Photos : 5 Mo au plus (`product-image.ts`) ; corps JSON limité (`configure-app.ts`) ; 6 Mo au plus devant Caddy |
| V5.2.2   | ✅     | Signature binaire vérifiée (JPEG, PNG, WebP) puis image **réencodée** en WebP (photos et pièces KYC)            |
| V5.3.1   | ✅     | Aucun fichier envoyé n'est écrit sur disque : images en base, servies en données (ADR-0035)                     |
| V5.3.2   | ✅     | Aucun chemin construit à partir d'un nom de fichier fourni (identifiants UUID)                                  |

## V6 — Authentification

| Exigence | Statut | Preuve                                                                                                                                          |
| -------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| V6.1.1   | ✅     | Limites documentées : ADR-0017 (3 essais puis 15 min, BR-040), ADR-0021 (limites par adresse et par compte), ADR-0034 (double authentification) |
| V6.2.1   | ✅     | 8 caractères au moins (`password-policy.ts`)                                                                                                    |
| V6.2.2   | 🔧     | **Nouveau** : « Changer mon mot de passe » dans « Mon compte » (`POST /api/v1/auth/password/change`, `ChangePasswordForm`)                      |
| V6.2.3   | 🔧     | **Nouveau** : mot de passe actuel exigé ; 3 erreurs → blocage 15 min et session fermée ; tests HTTP et de bout en bout                          |
| V6.2.4   | 🔧     | **Liste portée à 10 000** mots de passe courants de 8 caractères ou plus (SecLists, MIT) + liste locale (`common-passwords.ts`)                 |
| V6.2.5   | 🔧     | **Règle « une lettre et un chiffre » retirée** (API et site) : longueur et liste de refus seulement                                             |
| V6.2.6   | ✅     | Champs `type="password"` avec bouton « afficher » (`PasswordField`)                                                                             |
| V6.2.7   | ✅     | Collage et gestionnaires permis (aucun blocage ; `autocomplete` `current-password` / `new-password`)                                            |
| V6.2.8   | ✅     | Mot de passe vérifié tel quel par Argon2id : ni coupé, ni mis en minuscules (test « espaces et casse comptent »)                                |
| V6.3.1   | ✅     | Blocage après 3 erreurs (connexion, double authentification, changement de mot de passe), réponses neutres, limites par adresse et par compte   |
| V6.3.2   | ✅     | Aucun compte par défaut ; les comptes de test n'existent que dans la base éphémère de la CI (garde-fou `kemdia.e2e`)                            |
| V6.4.1   | ✅     | Codes à 6 chiffres tirés par `randomInt` (cryptographique), valables 10 min, à usage unique, essais limités (`otp.ts`)                          |
| V6.4.2   | ✅     | Ni indice ni question secrète                                                                                                                   |

## V7 — Sessions

| Exigence | Statut | Preuve                                                                                                                          |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| V7.2.1   | ✅     | Jeton vérifié par l'API à chaque requête (`session.service.ts`), jamais par le navigateur                                       |
| V7.2.2   | ✅     | Jetons de référence tirés à chaque connexion (aucune clé statique)                                                              |
| V7.2.3   | ✅     | 32 octets de `randomBytes` (256 bits) en base64url ; seule l'empreinte SHA-256 est en base (`secret.ts`)                        |
| V7.2.4   | ✅     | Nouvelle session à chaque connexion, mot de passe oublié ou changé ; l'ancienne session du navigateur est fermée (`actions.ts`) |
| V7.4.1   | ✅     | Déconnexion : session révoquée en base ; cookie effacé ; « déconnecter tous mes appareils »                                     |
| V7.4.2   | ✅     | Compte désactivé : statut vérifié à chaque requête (`session.service.ts`) → toutes ses sessions refusées aussitôt               |

## V8 — Autorisations

| Exigence | Statut | Preuve                                                                                                                                                        |
| -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V8.1.1   | ✅     | Règles d'accès : ADR-0020 (rôles), ADR-0034 (double authentification de l'équipe), ADR-0038 (commandes des vendeurs)                                          |
| V8.2.1   | ✅     | `RoleGuard` : règles de la classe ET de la méthode ; vérifié en CI (ZAP) : route d'équipe 200 pour l'administratrice, 403 client et vendeur, 401 sans session |
| V8.2.2   | ✅     | Données lues au nom du compte (`findByReference(accountId, …)`, boutique du vendeur) ; tests d'accès aux commandes d'autrui                                   |
| V8.3.1   | ✅     | Décisions prises par l'API ; le site ne fait que masquer des liens                                                                                            |

## V9 — Jetons autonomes · V10 — OAuth

| Exigence              | Statut | Preuve                                                     |
| --------------------- | ------ | ---------------------------------------------------------- |
| V9.1.1 à V9.2.1 (4)   | ➖     | Aucun jeton autonome (JWT) : sessions de référence en base |
| V10.4.1 à V10.4.5 (5) | ➖     | Kemdia n'est pas un serveur d'autorisation OAuth           |

## V11 — Cryptographie

| Exigence | Statut | Preuve                                                                                                                  |
| -------- | ------ | ----------------------------------------------------------------------------------------------------------------------- |
| V11.3.1  | ✅     | Aucun mode ECB ni bourrage PKCS#1 v1.5                                                                                  |
| V11.3.2  | ✅     | AES-256-GCM, nonce aléatoire (secrets TOTP, pièces KYC — ADR-0039) ; sauvegardes : AES-256 de restic                    |
| V11.4.1  | ✅     | SHA-256 (empreintes de jetons), Argon2id (mots de passe) ; SHA-1 seulement dans le HMAC du TOTP, imposé par la RFC 6238 |

## V12 — Communications

| Exigence | Statut | Preuve                                                                                       |
| -------- | ------ | -------------------------------------------------------------------------------------------- |
| V12.1.1  | ✅     | Caddy : TLS 1.2 et 1.3 seulement (réglage par défaut), TLS 1.3 préféré                       |
| V12.2.1  | ✅     | HTTPS partout, redirection automatique du port 80, HSTS ; services externes (Brevo) en HTTPS |
| V12.2.2  | ✅     | Certificats Let's Encrypt (serveur) et Render (démo)                                         |

## V13 — Configuration · V14 — Données

| Exigence | Statut | Preuve                                                                                                                                       |
| -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| V13.4.1  | ✅     | `.git` et `.github` exclus des images (`.dockerignore`) ; aucun dossier du dépôt servi                                                       |
| V14.2.1  | ✅     | Jetons et tickets dans des cookies `HttpOnly` ou l'en-tête `Authorization`, jamais dans une URL ; journaux sans chaîne de requête            |
| V14.3.1  | ✅     | Déconnexion : cookie effacé ; le navigateur ne garde aucune donnée du compte (favoris, ville et panier d'un visiteur non connecté seulement) |

## V15 — Code et dépendances

| Exigence | Statut | Preuve                                                                                                                                             |
| -------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| V15.1.1  | 🔧     | **Nouveau** : [politique de mise à jour des dépendances](politique-dependances.md) (critique 7 j, élevée 30 j, moyenne et faible : sprint suivant) |
| V15.2.1  | ✅     | `pnpm audit` (élevée ou critique = CI rouge), Trivy sur les images, Dependabot chaque semaine ; aucune alerte ouverte au 2026-10-19                |
| V15.3.1  | ✅     | Réponses construites par des présentateurs typés par le contrat (jamais l'objet de la base : ni empreinte, ni version de mot de passe)             |

## Hors niveau 1, à garder en tête

- Copie S3 des sauvegardes effaçable par un attaquant devenu root (ADR-0044) : parade à décider avec le client.
- `/api/health?complet=1` dit publiquement si la base est en panne (ADR-0045).
