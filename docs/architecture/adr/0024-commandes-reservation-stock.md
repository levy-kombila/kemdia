# ADR-0024 — Commandes : création depuis le panier, réservation du stock, idempotence

- **Statut** : Accepté
- **Date** : 2026-10-10
- **Tâche** : S5-T02
- **Complète** : [ADR-0023](0023-panier-serveur.md) (panier serveur), [ADR-0006](0006-monolithe-modulaire-7-modules.md) (modules), [ADR-0020](0020-roles-journal-audit.md) (`TransactionContext`)

## Contexte

Le panier serveur existe (S5-T01). Il faut maintenant **créer une commande** sans jamais vendre deux fois le même article
(BR-012), avec des montants **calculés par le serveur** (BR-004, faille CRIT-01 de l'ancien site), et sans créer deux commandes
quand le client appuie deux fois ou que le réseau mobile coupe. Le paiement en ligne arrive aux S5-T04 / T05.

Choix du propriétaire (2026-10-10) :

| Question                                   | Choix                                                               |
| ------------------------------------------ | ------------------------------------------------------------------- |
| Numéro de commande                         | **KMD-7F3K9Q** : 6 caractères au hasard, sans 0/O ni 1/I            |
| Réservation Mobile Money avant paiement    | **30 minutes**, puis annulation automatique et stock remis en vente |
| Annulation par le client                   | **Avant l'expédition**                                              |
| Prix changé entre le panier et la commande | **Refuser et montrer** le nouveau total (`PRIX_MODIFIE`)            |
| Barèmes de livraison                       | **Contrat partagé** (`@kemdia/contracts/delivery`)                  |
| Panier après la commande                   | **Vidé dans la même transaction**                                   |
| Adresse                                    | **Copiée dans la commande** (carnet d'adresses plus tard)           |

## Décision

```mermaid
sequenceDiagram
    participant S as Site (serveur)
    participant O as orders (OrderService)
    participant DB as PostgreSQL (une transaction)
    S->>O: POST /orders {idempotencyKey, expectedTotal, adresse, paiement}
    O->>O: adresse et numéro vérifiés (sans base)
    O->>DB: SET LOCAL lock_timeout = 3s
    O->>DB: panier du compte FOR UPDATE
    O->>DB: commande avec cette clé ? → la renvoyer (200)
    O->>DB: 3 commandes ouvertes au plus
    O->>DB: catalog : UPDATE stock = stock − q WHERE stock ≥ q (ligne par ligne, ordre des UUID)
    O->>O: montants avec les prix lus sur les lignes verrouillées ; total ≠ expectedTotal → PRIX_MODIFIE
    O->>DB: INSERT commande + lignes + historique ; panier vidé
    DB-->>S: 201 (ou tout annulé au moindre refus)
```

| Sujet                    | Choix                                                                                                                                                                                                                                                                                         | Raison                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Source des articles      | Le **panier serveur** du compte ; la requête ne contient ni article ni prix (schéma strict)                                                                                                                                                                                                   | BR-004 ; rien à falsifier                                                                        |
| Réservation (BR-012)     | Nouveau port public du catalogue `StockService` : `UPDATE … SET stock = stock − q WHERE stock ≥ q AND publié AND active RETURNING prix, titre…`, ligne par ligne **dans la transaction de la commande** ; refusé hors transaction                                                             | Le dernier article ne peut pas partir deux fois ; le prix figé est celui de la ligne verrouillée |
| Ordre des verrous        | Panier → variantes (ordre des UUID) ; annulation : commande → variantes (ordre des UUID)                                                                                                                                                                                                      | Pas d'interblocage entre commandes, annulations et tâche d'expiration                            |
| Montants                 | Sous-total, frais (barèmes du contrat, `estimateDelivery`) et total calculés par l'API ; `expectedTotal` (total affiché) seulement **comparé**                                                                                                                                                | Le client ne paie jamais un montant qu'il n'a pas vu                                             |
| Idempotence              | `idempotencyKey` (UUID tiré par le site) unique par compte + **empreinte de la demande** ; même clé et même demande → 200 avec la commande existante ; même clé, autre demande → `CLE_DEJA_UTILISEE`                                                                                          | Double appui, réponse perdue : une seule commande, jamais présentée pour une autre               |
| Statuts                  | `pending_payment` → `confirmed` → `preparing` → `shipped` → `delivered` ; `cancelled` ; Mobile Money : en attente 30 min ; à la livraison : confirmée tout de suite                                                                                                                           | Suivi de commande ; BR-010                                                                       |
| Annulation par le client | Avant l'expédition ; stock remis dans la même transaction ; **Mobile Money déjà payée : service client** (remboursement aux S5-T04 / T05)                                                                                                                                                     | Choix du propriétaire ; pas d'argent gardé sans trace                                            |
| Paiement non reçu        | Tâche toutes les minutes : annule les commandes en attente échues (verrou `SKIP LOCKED`, statut revérifié), stock remis ; par lots de 100 jusqu'à épuisement (30 s au plus)                                                                                                                   | Le stock ne reste pas bloqué                                                                     |
| Commandes ouvertes       | **3 au plus** par compte (en attente, confirmées, en préparation) → `TROP_DE_COMMANDES_OUVERTES`                                                                                                                                                                                              | Un compte ne peut pas bloquer le stock avec des commandes jamais payées (valeur à confirmer)     |
| Paiement à la livraison  | Valeurs **provisoires** du contrat (Grand Libreville, 100 000 FCFA, livraison comprise) → `PAIEMENT_A_LA_LIVRAISON_INDISPONIBLE`                                                                                                                                                              | Question ouverte n° 1 ; réglage serveur au S5-T04                                                |
| Numéro de commande       | `KMD-` + 6 caractères (alphabet de 32 symboles, un octet & 31 : uniforme) ; numéro déjà pris → un autre                                                                                                                                                                                       | BR-042 ; facile à dicter                                                                         |
| Adresse                  | Copiée dans la commande ; Unicode normalisé (NFC), caractères invisibles et de contrôle retirés                                                                                                                                                                                               | Texte imprimé sur l'étiquette du colis                                                           |
| Attente                  | Verrous 3 s, connexion 3 s, transaction 10 s → `PANIER_OCCUPE` (409, `Retry-After`)                                                                                                                                                                                                           | Pas d'erreur 500 ni de connexions bloquées pendant une vente flash                               |
| Base de données          | Contraintes : montants (total = articles + livraison), numéros, cohérence statut / échéance / annulation. Déclencheurs : montants, adresse et paiement **figés**, statuts **seulement dans l'ordre prévu**, échéance jamais repoussée, aucune suppression, lignes et historique en ajout seul | Même un bogue de l'API ne peut ni changer un montant, ni « ressusciter » une commande annulée    |
| Barèmes                  | Zones, villes, quartiers, frais, paiement à la livraison : `packages/contracts/src/delivery.ts`, **gelés** ; le site les réexporte                                                                                                                                                            | Un seul calcul pour l'affichage et la facture                                                    |
| Routes                   | `POST /orders/quote`, `POST /orders`, `GET /orders`, `GET /orders/{reference}`, `POST /orders/{reference}/cancel` ; session obligatoire ; 10/min par compte pour créer et annuler ; contrat **1.8.0**                                                                                         | Le site (S5-T07) a tout ce qu'il lui faut                                                        |

## Options écartées

- **Articles envoyés par le site** : il faudrait tout revérifier, et la tentation de réutiliser un prix venu du navigateur (CRIT-01).
- **Réservation au moment du paiement** : deux clients pourraient payer le même dernier article.
- **Lecture du stock puis écriture séparée** : une autre commande peut passer entre les deux ; la mise à jour conditionnelle fait les deux d'un coup.
- **Numéro qui se suit (KMD-000123)** : révèle le volume de ventes et permet de deviner les commandes des autres (BR-042).
- **Clé d'idempotence en en-tête HTTP** : équivalent ; dans le corps, elle est validée par le même schéma que le reste.
- **Barèmes en base dès maintenant** : aucun écran pour les modifier avant le S6/S7.

## Conséquences

- ➕ Pas de survente, montants toujours du serveur, une seule commande par demande, stock libéré sans intervention.
- ➕ Les modules de paiement (S5-T04 / T05) n'auront qu'à faire passer une commande de `pending_payment` à `confirmed` (sous verrou).
- ➖ Une commande Mobile Money payée ne s'annule pas en ligne avant l'arrivée du remboursement (service client).
- ➖ La limite de 3 commandes ouvertes freine aussi un client honnête qui commande beaucoup (valeur à confirmer avec le client).
- ➖ L'import de démonstration réécrit le stock à chaque démarrage de la démo (valeurs absolues) : sur la démo seulement, un redémarrage pendant une commande en attente peut fausser le stock. À traiter avec les écrans vendeurs (S6), qui devront ajuster le stock par différence.
- ➖ Les commandes ne s'effacent jamais (preuve d'achat) : l'anonymisation d'un compte supprimé est à prévoir (S7, conformité APDPVP).
