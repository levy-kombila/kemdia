# ADR-0038 — Commandes des vendeurs (BR-013)

- **Statut** : Accepté
- **Date** : 2026-10-17
- **Tâche** : S6-T07
- **Complète** : [ADR-0024](0024-commandes-reservation-stock.md) (commandes), [ADR-0026](0026-paiements.md) (paiements),
  [ADR-0032](0032-boutiques-vendeurs.md) (boutiques), [ADR-0037](0037-espace-vendeur.md) (espace vendeur)

## Contexte

Depuis le S6-T06, un vendeur met ses produits en vente, mais il ne sait pas qu'il a vendu : une commande ne connaissait pas
les boutiques de ses articles. La règle BR-013 demande que le vendeur **accepte ou refuse chaque commande qui le concerne**.
C'est la dernière brique pour des « vendeurs partenaires opérationnels » (jalon v0.7.0).

Choix du propriétaire (2026-10-17) :

| Question                         | Choix                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Délai de réponse du vendeur      | **24 heures** après la confirmation de la commande                            |
| Refus, ou pas de réponse à temps | **La commande ENTIÈRE est annulée** (pas d'annulation partielle au MVP)       |
| Écrans                           | **Dans la même tâche** : « Mes commandes » dans l'espace vendeur (`/vendeur`) |

## Décision

| Sujet                  | Choix                                                                                                                                                                                                                                                                                      | Raison                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Modèle                 | Une **part par boutique** (`orders.order_shop_parts`) et la boutique **figée sur chaque ligne** (`order_items.shop_id`), écrites dans la transaction de la commande                                                                                                                        | Un produit peut changer de boutique ou disparaître ; la commande garde ce qui a été vendu        |
| Boutique Kemdia        | Sa part est **acceptée d'office**                                                                                                                                                                                                                                                          | Kemdia ne se répond pas à elle-même                                                              |
| Ouverture              | Une part s'**ouvre** à la confirmation : commande payée (Mobile Money) ou paiement à la livraison. Échéance = ouverture + 24 h                                                                                                                                                             | Le vendeur ne prépare pas une commande qui ne sera peut-être jamais payée                        |
| Accepter               | Part « acceptée » ; quand **toutes** les parts de vendeurs le sont, la commande passe « en préparation »                                                                                                                                                                                   | Rien ne part tant qu'un vendeur n'a pas confirmé                                                 |
| Refuser                | Motif obligatoire (5 à 300 caractères), **gardé chez Kemdia**, jamais montré au client. La commande entière est annulée (`vendeur_refus`)                                                                                                                                                  | Choix du propriétaire ; le client voit seulement « un vendeur n'a pas pu la préparer »           |
| Pas de réponse         | Tâche planifiée (chaque minute, avec l'expiration Mobile Money) : part « expirée », commande annulée (`vendeur_delai`), au nom du serveur                                                                                                                                                  | Le client n'attend pas indéfiniment                                                              |
| Annulation             | Comme l'annulation par l'équipe : stock remis en vente, coupon rendu ; le module payments (crochet `onVendorCancel`) expire les essais en attente, note le remboursement **« à faire »** d'une commande payée et émet l'avoir                                                              | Une seule façon d'annuler, déjà testée ; le remboursement reste manuel tant que l'API ne l'a pas |
| Ce que voit le vendeur | **Ses** articles (copie figée), le sous-total de ses articles, la **ville** de livraison, les dates. Ni nom, ni téléphone, ni adresse du client                                                                                                                                            | Minimisation des données (APDPVP) : la livraison passe par Kemdia (S7)                           |
| Accès                  | `/api/v1/vendors/orders` : rôle vendeur **et** boutique active relue sous verrou partagé dans la transaction ; le module orders ne reçoit que l'identifiant de **cette** boutique. Commande sans produit de la boutique : **404**                                                          | Pas d'IDOR possible : la boutique ne vient jamais de la requête                                  |
| Concurrence            | Commande verrouillée (`FOR UPDATE`) pour décider ; la tâche planifiée prend `SKIP LOCKED`. Décider exige `échéance > maintenant`, expirer `échéance ≤ maintenant`. Déclencheur SQL : une décision ne change plus                                                                           | Double clic, refus pendant l'expiration : un seul gagnant                                        |
| Encaissement espèces   | **Refusé tant qu'une part de vendeur attend** (relecture de sécurité)                                                                                                                                                                                                                      | Sinon l'annulation à l'échéance échouerait à chaque passage et la commande resterait bloquée     |
| E-mail au vendeur      | « Nouvelle commande », envoyé **après** la transaction par une tâche planifiée : envoi réservé, essais à 1 min, 10 min, 1 h, 6 h (5 au plus) ; abandonné si plus rien à décider. Référence, nombre d'articles, montant, échéance seulement                                                 | Un e-mail lent ne bloque jamais une commande ; aucun envoi en double                             |
| Journal d'audit        | `order.vendor_accepted`, `order.vendor_refused` (avec motif), `order.vendor_timeout`, dans la transaction                                                                                                                                                                                  | Trace de chaque décision                                                                         |
| Site                   | `/vendeur/commandes` (par statut, « À traiter » d'abord) et `/vendeur/commandes/{référence}` : formulaires HTML simples (sans JavaScript) ; référence vérifiée (`KMD-XXXXXX`) avant toute adresse ; avis et erreurs en liste fermée                                                        | Même modèle que les autres pages de l'espace vendeur                                             |
| Migration              | Ajout seul, compatible avec l'API précédente pendant le déploiement : la base remplit `shop_id` si l'ancienne API ne le donne pas. Commandes existantes : une part par boutique ; celles d'un vendeur sur une commande **confirmée** sont à traiter, avec 24 h **à partir du déploiement** | Pas de coupure pendant le redéploiement                                                          |

Contrat de l'API : **1.18.0** (routes `vendors/orders`, statuts `VENDOR_ORDER_STATUSES`, raisons d'annulation `vendeur_refus` et
`vendeur_delai`, codes `DECISION_IMPOSSIBLE` et `MOTIF_REFUS_INVALIDE`).

## Conséquences

- Une commande multi-boutiques dépend de la boutique la plus lente (24 h au plus) ; un seul refus annule tout. À revoir
  avec le client si les paniers multi-vendeurs deviennent fréquents (annulation partielle, nouvelle tâche).
- Les commissions (BR-020) pourront se calculer par part de boutique : le sous-total de chaque part est enregistré.
- Le remboursement d'une commande Mobile Money refusée reste **à faire à la main** (comme depuis le S5-T04).
- Commandes créées par l'ancienne API pendant les quelques minutes du redéploiement : sans part de boutique, donc
  invisibles des vendeurs (constat bas de la relecture). Rattrapage possible par une requête SQL, à faire seulement si le
  cas se présente.

## Alternatives écartées

- **Annuler seulement la part refusée** : remboursement partiel, frais de livraison à recalculer, facture à refaire. Trop
  lourd pour le MVP (choix du propriétaire).
- **Montrer au vendeur le nom et le téléphone du client** : inutile tant que Kemdia gère la livraison, et contraire à la
  minimisation des données.
- **Envoyer l'e-mail dans la transaction** : une panne du fournisseur d'e-mails bloquerait la commande.
