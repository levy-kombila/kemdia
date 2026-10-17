# Rapport — S6-T08 : vérification des vendeurs, KYC (BR-024)

|                                                 |                                                     |
| ----------------------------------------------- | --------------------------------------------------- |
| **Date**                                        | 2026-10-17                                          |
| **Sprint / tâches**                             | S6 — S6-T08                                         |
| **Version**                                     | v0.5.0 ; contrat de l'API **1.19.0** (1.18.0 avant) |
| **Sections du cahier d'architecture modifiées** | §3.21 (nouvelle), §5.16 ; version **4.5**           |

## 1. Résumé

Un vendeur peut faire vérifier sa boutique : identité, RCCM pour une entreprise, compte de versement (Airtel, Moov ou
banque), avec les photos des pièces. Tout est **chiffré**. Un administrateur examine le dossier, puis le valide ou le
refuse avec un motif ; les photos sont effacées 30 jours après sa décision. Tant qu'un dossier n'est pas validé, aucun
versement ne sera possible (BR-024) ; les ventes, elles, continuent.

Le site est aussi mis à jour : le menu du compte (en-tête) mène directement à l'espace vendeur, aux commandes à traiter
et à l'espace de l'équipe selon les rôles ; le tableau de bord du vendeur compte ses commandes à traiter et montre où en
est sa vérification ; « Carte bancaire », jamais proposée, disparaît du pied de page et de la page « Paiement ».

## 2. Fonctionnalités livrées

| Partie      | Description                                                                                                                                                                                 | Fichiers principaux                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Base        | `vendors.kyc_files` (un dossier par boutique) et `vendors.kyc_documents` (photos), contraintes SQL                                                                                          | `prisma/migrations/20261017120000_kyc_vendeurs/`                                           |
| Domaine     | Saisie vérifiée (opérateur ↔ numéro, RCCM ↔ entreprise), photos demandées, états, décision, date d'effacement                                                                               | `vendors/domain/kyc.ts`                                                                    |
| Chiffrement | AES-256-GCM, données associées « boutique:champ », clé `KYC_ENCRYPTION_KEY` (différente de la clé TOTP)                                                                                     | `vendors/infrastructure/kyc-box.ts`, `config/env.ts`                                       |
| Photos      | Réencodées en WebP sans métadonnées, puis chiffrées                                                                                                                                         | `vendors/infrastructure/kyc-image-processor.ts`                                            |
| API         | `GET/PUT /vendors/kyc`, `POST /vendors/kyc/documents/{sorte}`, `POST /vendors/kyc/submit` ; `GET /admin/kyc`, `GET /admin/kyc/{boutique}[/documents/{sorte}]`, `POST …/approve`, `…/reject` | `vendors/application/kyc.service.ts`, `vendors/interface/kyc.controller.ts`                |
| Effacement  | Tâche chaque heure : photos des dossiers décidés depuis 30 jours                                                                                                                            | `vendors/infrastructure/kyc-purge.ts`                                                      |
| Site        | `/vendeur/verification` ; `/equipe/verifications` et sa fiche (photos relayées sans cache) ; relais d'envoi commun aux photos de produits et de pièces                                      | `app/vendeur/verification/**`, `app/equipe/verifications/**`, `lib/vendor/upload-relay.ts` |
| En-tête     | Liens « Espace vendeur », « Commandes à traiter », « Espace de l'équipe » selon les rôles                                                                                                   | `components/layout/AccountMenu.tsx`, `Header.tsx`                                          |
| Divers      | Tableau de bord vendeur (commandes à traiter, vérification), « Carte bancaire » retirée, menus vendeur et équipe                                                                            | `app/vendeur/page.tsx`, `components/layout/Footer.tsx`, `app/infos/[slug]/page.tsx`        |

## 3. Décisions techniques

[ADR-0039](../architecture/adr/0039-verification-vendeurs.md). Choix du propriétaire (2026-10-17) : photos **dans
PostgreSQL, chiffrées** ; effacées **30 jours** après la décision (à confirmer, question ouverte n° 9) ; KYC non validé =
**versements seulement** bloqués ; mises à jour du site : menu du compte, tableau de bord vendeur, pied de page.

## 4. Sécurité

- Numéro de pièce, compte de versement et photos chiffrés ; seuls les 4 derniers caractères restent en clair. Une boîte
  recopiée sur une autre boutique ou un autre champ ne s'ouvre pas.
- Clé de développement publique : **poste local seulement**. En démo, sans `KYC_ENCRYPTION_KEY`, la vérification est
  fermée (`KYC_INDISPONIBLE`) : aucune vraie pièce chiffrée avec une clé publique.
- Le vendeur ne revoit jamais ses numéros complets ni ses photos. L'équipe : administrateurs seulement, double
  authentification confirmée, dossiers envoyés seulement ; chaque ouverture de dossier et chaque photo regardée sont
  inscrites au journal d'audit (jamais les numéros).
- Photos : format lu dans les octets et par le décodeur, 40 Mpx au plus, EXIF et GPS retirés, file bornée.
- Le navigateur reçoit deux oui/non pour le menu (vendeur, équipe), jamais la liste des rôles.

**Relecture de sécurité indépendante** (agent séparé) : **aucun constat bloquant**. Corrigé :

| Gravité | Constat                                                                 | Correction                                                  |
| ------- | ----------------------------------------------------------------------- | ----------------------------------------------------------- |
| Basse   | Les clés KYC et TOTP pouvaient être identiques                          | Démarrage refusé si elles le sont (test)                    |
| Basse   | L'effacement planifié pouvait toucher un dossier en cours de correction | Seulement les dossiers décidés, verrouillés (`SKIP LOCKED`) |
| Basse   | File d'attente de réencodage sans limite                                | 8 en attente au plus, puis « réessayez »                    |
| Info    | Un administrateur qui a une boutique pouvait ouvrir son propre dossier  | Consultation aussi interdite (test d'intégration)           |

Gardés et documentés dans l'ADR : photos d'un dossier jamais envoyé ou jamais décidé sans limite de durée ; suppression
d'une boutique avec dossier à prévoir dans le futur parcours de suppression de compte ; pas de rotation de clé.

Semgrep 1.179.0 sur les fichiers changés : aucun constat de sécurité réel (mots de passe publics des comptes de test e2e,
déjà connus). Gitleaks 8.30.1 (empreinte vérifiée) : aucune fuite dans les commits de la branche.

## 5. Qualité

| Vérification                                   | Résultat                                                                                                                                   |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Format, lint, types                            | ✅                                                                                                                                         |
| Build (site construit sur une API injoignable) | ✅                                                                                                                                         |
| Tests unitaires API                            | ✅ 555 (546 avant) : domaine du dossier, chiffrement (clé de démo refusée, boîte modifiée), config                                         |
| Tests d'intégration (`kemdia_test`)            | ✅ 195 (191 avant) : parcours complet, rien en clair dans la base, EXIF retiré, refus et correction, effacement, accès, sa propre boutique |
| Tests unitaires du site                        | ✅ 404 (399 avant) : menu selon les rôles, actions du vendeur et de l'équipe                                                               |
| Tests du contrat                               | ✅ 32                                                                                                                                      |
| Playwright + axe                               | Nouveau parcours « Vérification » (profil mobile) : **lancé par la CI** de la PR, avec une clé jetable                                     |

## 6. Captures d'écran

Pas de captures dans cette tâche, pour économiser le temps d'utilisation : les pages se vérifient sur la démo après la
fusion et l'ajout de la clé.

## 7. Limites connues / dette technique

- Pas encore de versements : le statut « vérifié » servira quand les commissions (BR-020) seront branchées.
- Changer de compte de versement après validation passe par le service client.
- Le parcours Playwright couvre le vendeur ; l'examen par l'équipe est couvert par les tests d'intégration.
- Conservation de 30 jours à confirmer avec le client (question n° 9).

## 8. Prochaines étapes

- **Avant de tester sur la démo** : ajouter `KYC_ENCRYPTION_KEY` sur Render (guide de la démo, étape 11).
- Après la fusion : `db:deploy` puis `db:check` ; attendre la fin du job « Déploiement DÉMO (Render) ».
- Clôture du S6 (v0.7.0) ; commissions (BR-020) dès la réponse du client.
