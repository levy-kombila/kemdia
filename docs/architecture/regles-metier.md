# Règles métier et exigences fonctionnelles

> Source : KSAD Volume 2 (chapitres 7 et 8) + business plan, numérotés comme le recommande le KSAD.
> Chaque règle **BR-xxx** sera vérifiée par au moins un **test automatisé** côté serveur, au sprint indiqué.
> Une règle se modifie ici d'abord (dans une PR), puis dans le code.

## Règles métier (BR)

### Catalogue et vendeurs

| ID     | Règle                                                                                                                                                                                                                                                                                                                                                                       | Module           | Sprint  |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| BR-001 | Un produit indisponible ou à stock nul ne peut ni être ajouté au panier, ni commandé. ✅ S3 : `Product.checkOrderable`, `CatalogService.checkAvailability` (testés) ; ✅ S5-T01 : le panier serveur refuse l'ajout et revérifie chaque ligne à chaque lecture (`CatalogService.describeLines`) ; commande au S5-T02                                                         | catalog, orders  | S3 · S5 |
| BR-002 | Un vendeur ne peut pas supprimer un produit lié à une commande en cours ; le produit est seulement désactivé.                                                                                                                                                                                                                                                               | catalog          | S6      |
| BR-003 | Tout produit d'un vendeur tiers est **validé par un administrateur** avant d'être visible.                                                                                                                                                                                                                                                                                  | catalog, vendors | S6      |
| BR-004 | Les prix sont des **entiers en FCFA** ; tout montant est **recalculé par le serveur** (jamais lu depuis le navigateur). ✅ S5-T01 : le panier serveur ne stocke aucun prix, il les relit dans le catalogue. ✅ S5-T02 : la commande ne reçoit ni article ni prix ; montants calculés avec les prix des variantes verrouillées, puis figés par la base ; paiement au S5-T04. | orders, payments | S5      |
| BR-005 | Les catégories ont **3 niveaux au plus** (rayon › sous-rayon › catégorie). ✅ S3 : vérifié par le domaine (`MAX_CATEGORY_DEPTH`) et par la base (déclencheur `categories_depth_check`, qui refuse aussi les boucles). Décision du 2026-10-06 (question 8).                                                                                                                  | catalog          | S3      |

### Commandes

| ID     | Règle                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Module           | Sprint |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------ |
| BR-010 | Une commande au statut « livrée » ne peut plus être annulée par le client. ✅ S5-T02 : annulation par le client **avant l'expédition** seulement (choix du 2026-10-10), vérifiée par le domaine et par un déclencheur SQL (statuts dans l'ordre prévu).                                                                                                                                                                                                                                                                                               | orders           | S5     |
| BR-011 | Le **paiement à la livraison** n'est proposé que dans certaines zones et sous un **plafond** de panier. Valeurs **provisoires** dans l'interface (S2) : Grand Libreville, 100 000 FCFA (`lib/checkout.ts`) — à confirmer (question 1). ✅ S5-T04 : **réglage en base** (zones, total maximum livraison comprise) changé par un administrateur (`PUT /admin/settings/cod`, journal d'audit), lu par le devis et la commande ; valeurs de départ = valeurs provisoires ; encaissement noté par un administrateur. Décision du client toujours attendue. | orders, payments | S5     |
| BR-012 | Le stock est réservé **dans la même transaction** que la création de la commande (pas de survente). ✅ S5-T02 : mise à jour conditionnelle de chaque variante (`stock ≥ quantité`) dans la transaction de la commande ; testé avec deux clients pour le dernier article ; Mobile Money non payé en 30 min : stock remis.                                                                                                                                                                                                                              | orders, catalog  | S5     |
| BR-013 | Le vendeur accepte ou refuse chaque commande qui le concerne. ✅ S6-T07 : une part par boutique ; réponse sous **24 h** ; refus (motif gardé chez Kemdia) ou silence = **commande entière annulée** (choix du 2026-10-17) ; le vendeur ne voit que ses articles et la ville.                                                                                                                                                                                                                                                                          | orders, vendors  | S6     |

### Finances et commissions

| ID     | Règle                                                                                                                                                | Module     | Sprint    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------- |
| BR-020 | Commission marketplace de **8 % à 14 %** sur chaque vente d'un vendeur tiers (taux par catégorie ou par vendeur).                                    | vendors    | S6        |
| BR-021 | Kemdia perçoit **15 %** de chaque frais de livraison facturé.                                                                                        | shipping   | S7        |
| BR-022 | Vente via un affilié d'un produit tiers : sur 14 % de commission, **10 % à l'affilié, 4 % à Kemdia** ; produit Kemdia : commission fixe à l'affilié. | affiliates | Après MVP |
| BR-023 | TVA de **18 %** appliquée dès que le chiffre d'affaires annuel dépasse **25 millions de FCFA** (à confirmer par un comptable).                       | payments   | S7        |
| BR-024 | Un vendeur ne reçoit aucun versement tant que son **KYC** (identité + compte Mobile Money / bancaire) n'est pas validé.                              | vendors    | S6        |

### Promotions

| ID     | Règle                                                                                                                                                                                                                                                                                                            | Module | Sprint |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| BR-030 | Un coupon expiré ou ayant atteint sa limite d'utilisation est refusé ; l'utilisation est comptée **de façon atomique**. ✅ S5-T03 : coupon verrouillé dans la transaction de la commande, compteur borné par la base ; testé avec deux clients pour la dernière utilisation ; rendue si la commande est annulée. | orders | S5     |
| BR-031 | Cumul coupon + vente flash : **à définir** (proposition : non cumulable). ✅ S5-T03 : non cumulable **par défaut** (articles à prix barré exclus), réglable coupon par coupon (`stackableWithSales`) ; décision du client toujours attendue (question 2).                                                        | orders | S5     |

### Sécurité et identité

| ID     | Règle                                                                                                              | Module   | Sprint |
| ------ | ------------------------------------------------------------------------------------------------------------------ | -------- | ------ |
| BR-040 | Après **3 échecs** de connexion, le compte est bloqué **15 minutes**.                                              | identity | S4     |
| BR-041 | Connexion impossible tant que l'e-mail ou le téléphone n'est pas vérifié (code OTP).                               | identity | S4     |
| BR-042 | Les identifiants visibles publiquement sont des **UUID**, jamais des numéros qui se suivent. ✅ catalogue (S3-T03) | tous     | S3     |

## Exigences fonctionnelles (FR) — correspondance KSAD → sprint

| FR              | Exigence                                                                                                      | Sprint                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| FR-001          | Création de compte client, vendeur, livreur                                                                   | S4 (client) · S6 (vendeur) · après MVP (livreur)                   |
| FR-004          | Connexion par e-mail **ou** numéro de téléphone                                                               | S4                                                                 |
| FR-012          | Mot de passe oublié (lien ou code OTP)                                                                        | S4                                                                 |
| FR-002          | Un vendeur publie un produit (description, images, prix)                                                      | S6                                                                 |
| FR-005          | Recherche multicritère (catégorie, prix, avis, disponibilité)                                                 | S1 ✅ (partiel) · S2 (filtres) · S3 (serveur)                      |
| FR-013          | Variantes de produits (tailles, couleurs) avec stocks distincts                                               | S3 ✅ (API, [ADR-0009](adr/0009-modele-catalogue.md))              |
| FR-006          | Ajouter, modifier, supprimer des articles du panier                                                           | S1 ✅ (navigateur) · S5 ✅ (serveur, S5-T01)                       |
| FR-014          | Panier conservé entre deux visites / liste de souhaits                                                        | S1 ✅ (navigateur) · S2 (favoris) · S5 ✅ (compte, tous appareils) |
| FR-007          | Valider le panier et passer commande — **compte obligatoire** (décision du 2026-10-10)                        | S5 (API ✅ S5-T02 ; site S5-T07)                                   |
| FR-015          | Facture numérique après paiement. ✅ S5-T06 (ADR-0028) : au paiement reçu, avoir à l'annulation, PDF + e-mail | S5                                                                 |
| FR-016          | Le vendeur valide ou refuse une commande                                                                      | S6                                                                 |
| FR-003 / FR-009 | Paiement sécurisé : Moov Money, Airtel Money                                                                  | S5                                                                 |
| FR-017          | Paiement à la livraison selon la zone                                                                         | S5                                                                 |
| FR-018          | Le livreur met à jour le statut (récupéré, en cours, livré)                                                   | S7                                                                 |
| FR-010          | Suivi GPS en temps réel                                                                                       | ⏳ après MVP (KSAD : Kemdia Logistics)                             |
| FR-019          | L'administrateur valide le KYC des vendeurs                                                                   | S6                                                                 |
| FR-020          | Modération des avis                                                                                           | S6                                                                 |

## Questions ouvertes

À trancher par l'équipe (réponse à noter ici, puis dans une ADR si elle a un impact technique) :

1. **Paiement à la livraison** : quelles villes ? quel plafond (ex. 100 000 FCFA) ?
   _2026-10-10 : pas encore fixé par le client. En attendant (S5-T04) : valeurs provisoires (Grand Libreville, 100 000 FCFA) dans un réglage serveur modifiable sans code._
   _✅ S5-T04 : réglage en place (`GET/PUT /api/v1/admin/settings/cod`) ; le client n'aura qu'à donner ses villes et son plafond._
2. **Coupons** : cumulables avec les ventes flash ?
   _2026-10-10 : pas encore décidé. En attendant (S5-T03) : non cumulable par défaut (proposition de BR-031), réglable coupon par coupon._
3. **Commission marketplace** : taux unique ou par catégorie (8 % high-tech, 14 % mode…) ?
   _2026-10-15 : pas encore de réponse du client. Le S6-T01 (boutiques) n'en dépend pas ; le réglage des taux arrivera avec la tâche des commissions (BR-020), sans valeur inventée._
4. **Affiliation** : lancée avec le MVP ou juste après ? commission fixe sur les produits Kemdia : quel montant ?
5. **Transporteur** : COMAT confirmé ? mode d'échange (API, fichier, WhatsApp) ?
6. **TVA** : seuil et modalités à valider avec un expert-comptable gabonais.
   _S5-T06 : factures « TVA non applicable » (mention réglable par l'administrateur). Une TVA réelle demandera le détail HT / TVA. Les informations légales (raison sociale, NIF, RCCM) sont aussi à fournir : en production, aucune facture n'est émise avant._
7. **Mobile Money** : agrégateur unique (qui gère Airtel + Moov) ou intégration directe de chaque opérateur ?
   _2026-10-10 : pas encore décidé, comptes marchands non ouverts. En attendant (S5-T05) : port neutre + simulateur « sandbox » maison (webhooks signés compris) ; le vrai fournisseur se branchera dessus. Le jalon v0.5.0 se fera sur ce simulateur._
   _S5-T04 : port `PaymentProvider` en place (fournisseur simulé en local et en démo, aucun en production) ; remboursements suivis à la main en attendant l'API du fournisseur._
   _✅ S5-T05 : bac à sable en place (opérateur simulé, téléphone simulé, notifications signées). Le vrai fournisseur = un adaptateur et sa clé, à ajouter avec ton accord._
   _S5-T07 : tant qu'aucun fournisseur n'est branché (préproduction, production), le site ne propose pas Mobile Money et l'API refuse une commande Mobile Money : seul le paiement à la livraison reste possible._
8. ~~**Profondeur des catégories**~~ — ✅ **Tranchée le 2026-10-06 : 3 niveaux au plus** (règle BR-005).
   Le rayon « Mode › Sport › Fitness » était mal classé : « Fitness » et ses sous-catégories (Musculation, Yoga, Cardio,
   Accessoires fitness — 7 produits) sont déplacés sous « Sport & Loisirs ». Les adresses des pages ne changent pas.
