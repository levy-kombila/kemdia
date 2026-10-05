# Règles métier et exigences fonctionnelles

> Source : KSAD Volume 2 (chapitres 7 et 8) + business plan, numérotés comme le recommande le KSAD.
> Chaque règle **BR-xxx** sera vérifiée par au moins un **test automatisé** côté serveur, au sprint indiqué.
> Une règle se modifie ici d'abord (dans une PR), puis dans le code.

## Règles métier (BR)

### Catalogue et vendeurs

| ID     | Règle                                                                                                                   | Module           | Sprint  |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------- | ------- |
| BR-001 | Un produit indisponible ou à stock nul ne peut ni être ajouté au panier, ni commandé.                                   | catalog, orders  | S3 · S5 |
| BR-002 | Un vendeur ne peut pas supprimer un produit lié à une commande en cours ; le produit est seulement désactivé.           | catalog          | S6      |
| BR-003 | Tout produit d'un vendeur tiers est **validé par un administrateur** avant d'être visible.                              | catalog, vendors | S6      |
| BR-004 | Les prix sont des **entiers en FCFA** ; tout montant est **recalculé par le serveur** (jamais lu depuis le navigateur). | orders, payments | S5      |

### Commandes

| ID     | Règle                                                                                                                                       | Module           | Sprint |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------ |
| BR-010 | Une commande au statut « livrée » ne peut plus être annulée par le client.                                                                  | orders           | S5     |
| BR-011 | Le **paiement à la livraison** n'est proposé que dans certaines zones et sous un **plafond** de panier (valeurs : voir questions ouvertes). | orders, payments | S5     |
| BR-012 | Le stock est réservé **dans la même transaction** que la création de la commande (pas de survente).                                         | orders, catalog  | S5     |
| BR-013 | Le vendeur accepte ou refuse chaque commande qui le concerne.                                                                               | orders, vendors  | S6     |

### Finances et commissions

| ID     | Règle                                                                                                                                                | Module     | Sprint    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | --------- |
| BR-020 | Commission marketplace de **8 % à 14 %** sur chaque vente d'un vendeur tiers (taux par catégorie ou par vendeur).                                    | vendors    | S6        |
| BR-021 | Kemdia perçoit **15 %** de chaque frais de livraison facturé.                                                                                        | shipping   | S7        |
| BR-022 | Vente via un affilié d'un produit tiers : sur 14 % de commission, **10 % à l'affilié, 4 % à Kemdia** ; produit Kemdia : commission fixe à l'affilié. | affiliates | Après MVP |
| BR-023 | TVA de **18 %** appliquée dès que le chiffre d'affaires annuel dépasse **25 millions de FCFA** (à confirmer par un comptable).                       | payments   | S7        |
| BR-024 | Un vendeur ne reçoit aucun versement tant que son **KYC** (identité + compte Mobile Money / bancaire) n'est pas validé.                              | vendors    | S6        |

### Promotions

| ID     | Règle                                                                                                                   | Module | Sprint |
| ------ | ----------------------------------------------------------------------------------------------------------------------- | ------ | ------ |
| BR-030 | Un coupon expiré ou ayant atteint sa limite d'utilisation est refusé ; l'utilisation est comptée **de façon atomique**. | orders | S5     |
| BR-031 | Cumul coupon + vente flash : **à définir** (proposition : non cumulable).                                               | orders | S5     |

### Sécurité et identité

| ID     | Règle                                                                                        | Module   | Sprint |
| ------ | -------------------------------------------------------------------------------------------- | -------- | ------ |
| BR-040 | Après **3 échecs** de connexion, le compte est bloqué **15 minutes**.                        | identity | S4     |
| BR-041 | Connexion impossible tant que l'e-mail ou le téléphone n'est pas vérifié (code OTP).         | identity | S4     |
| BR-042 | Les identifiants visibles publiquement sont des **UUID**, jamais des numéros qui se suivent. | tous     | S3     |

## Exigences fonctionnelles (FR) — correspondance KSAD → sprint

| FR              | Exigence                                                        | Sprint                                           |
| --------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| FR-001          | Création de compte client, vendeur, livreur                     | S4 (client) · S6 (vendeur) · après MVP (livreur) |
| FR-004          | Connexion par e-mail **ou** numéro de téléphone                 | S4                                               |
| FR-012          | Mot de passe oublié (lien ou code OTP)                          | S4                                               |
| FR-002          | Un vendeur publie un produit (description, images, prix)        | S6                                               |
| FR-005          | Recherche multicritère (catégorie, prix, avis, disponibilité)   | S1 ✅ (partiel) · S2 (filtres) · S3 (serveur)    |
| FR-013          | Variantes de produits (tailles, couleurs) avec stocks distincts | S3                                               |
| FR-006          | Ajouter, modifier, supprimer des articles du panier             | S1 ✅ (navigateur) · S5 (serveur)                |
| FR-014          | Panier conservé entre deux visites / liste de souhaits          | S1 ✅ (navigateur) · S2 (favoris)                |
| FR-007          | Valider le panier et passer commande                            | S5                                               |
| FR-015          | Facture numérique après paiement                                | S5                                               |
| FR-016          | Le vendeur valide ou refuse une commande                        | S6                                               |
| FR-003 / FR-009 | Paiement sécurisé : Moov Money, Airtel Money                    | S5                                               |
| FR-017          | Paiement à la livraison selon la zone                           | S5                                               |
| FR-018          | Le livreur met à jour le statut (récupéré, en cours, livré)     | S7                                               |
| FR-010          | Suivi GPS en temps réel                                         | ⏳ après MVP (KSAD : Kemdia Logistics)           |
| FR-019          | L'administrateur valide le KYC des vendeurs                     | S6                                               |
| FR-020          | Modération des avis                                             | S6                                               |

## Questions ouvertes

À trancher par l'équipe (réponse à noter ici, puis dans une ADR si elle a un impact technique) :

1. **Paiement à la livraison** : quelles villes ? quel plafond (ex. 100 000 FCFA) ?
2. **Coupons** : cumulables avec les ventes flash ?
3. **Commission marketplace** : taux unique ou par catégorie (8 % high-tech, 14 % mode…) ?
4. **Affiliation** : lancée avec le MVP ou juste après ? commission fixe sur les produits Kemdia : quel montant ?
5. **Transporteur** : COMAT confirmé ? mode d'échange (API, fichier, WhatsApp) ?
6. **TVA** : seuil et modalités à valider avec un expert-comptable gabonais.
7. **Mobile Money** : agrégateur unique (qui gère Airtel + Moov) ou intégration directe de chaque opérateur ?
