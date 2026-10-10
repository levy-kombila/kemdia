# Rapport — S5-T01 : colonnes obsolètes supprimées, panier serveur

|                                                 |                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------ |
| **Date**                                        | 2026-10-10                                                                           |
| **Sprint / tâches**                             | S5 — S5-T01                                                                          |
| **Version**                                     | v0.5.0 (en cours) — contrat de l'API **1.7.0**                                       |
| **Sections du cahier d'architecture modifiées** | §2.1, §3.3, §3.5, §3.7, §3.9, §3.11 (nouvelle), §5.10 (nouvelle), §6.4 — version 2.9 |

## 1. Résumé

Deux choses. D'abord, la **dette du S4** est soldée : les colonnes `failed_logins` et `locked_until` disparaissent de la table
des comptes (étape 2 de l'ADR-0022 ; la v0.4.0 en ligne ne les lisait plus). Ensuite, le Sprint 5 démarre avec le **panier serveur** :
un client connecté retrouve **le même panier** sur son téléphone et son ordinateur, le serveur **revérifie chaque article** (prix actuel,
produit encore en vente, stock) à chaque affichage, et le panier fait avant la connexion **rejoint** celui du compte, quantités additionnées.

```
Visiteur ──► panier du navigateur (comme avant)
Connecté ──► Site (actions serveur) ──(clé interne + jeton)──► API /api/v1/cart ──► orders.carts / cart_items
                                                                     └── prix et stock relus dans catalog à chaque réponse
```

## 2. Fonctionnalités livrées

| Élément                       | Ce que ça fait                                                                                                                                                                                                 | Fichiers principaux                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Colonnes supprimées           | Migration `DROP COLUMN` + contrainte `accounts_failed_logins_check` ; champs `@ignore` retirés ; test qui vérifie leur absence                                                                                 | `migrations/20261010120000_retrait_colonnes_blocage`, `identity.prisma`      |
| Module `orders`               | Nouveau schéma PostgreSQL `orders` (`carts`, `cart_items`) ; un panier par compte ; **aucun prix enregistré**                                                                                                  | `prisma/schema/orders.prisma`, `migrations/20261010130000_panier`            |
| Règles du panier              | 50 lignes, 1 à 20 par ligne, quantité ramenée au stock, BR-001 à l'ajout ; vérifiées par le domaine **et** par la base (contrainte + déclencheur)                                                              | `orders/domain/cart.ts`                                                      |
| Vérification à chaque lecture | Prix actuel (BR-004), `ok` / raison / quantité restante par ligne (BR-001), total des seules lignes commandables, `ok` global = passage en caisse possible                                                     | `orders/application/cart.service.ts`, `catalog.service.ts` (`describeLines`) |
| Routes                        | `GET/DELETE /cart`, `POST /cart/items`, `PUT/DELETE /cart/items/{variantId}`, `POST /cart/merge` — session obligatoire, jamais en cache                                                                        | `orders/interface/cart.controller.ts`, `docs/api/openapi.json`               |
| Réunion après connexion       | Quantités **additionnées**, articles impossibles ignorés et comptés, **idempotente** (identifiant de réunion)                                                                                                  | `prisma-cart.repository.ts`, `CartProvider.tsx`                              |
| Ménage                        | Paniers sans activité depuis **90 jours** supprimés (toutes les heures, premier passage 5 min après le démarrage)                                                                                              | `orders/infrastructure/cart-cleanup.ts`                                      |
| Site                          | Visiteur : panier du navigateur ; connecté : panier du compte (actions serveur) ; article signalé « plus disponible » / « plus que N », « Commander » bloqué                                                   | `lib/orders/*`, `CartProvider.tsx`, `CartView.tsx`, `CheckoutFlow.tsx`       |
| Contrat 1.7.0                 | Schémas `Cart`, `CartLine`, `CartAddRequest`, `CartQuantityRequest`, `CartMergeRequest`, `CartMerged` ; codes `PANIER_PLEIN`, `PRODUIT_INDISPONIBLE`, `VARIANTE_INCONNUE`, `PANIER_OCCUPE` ; limites partagées | `packages/contracts`                                                         |

## 3. Décisions techniques

[ADR-0023](../architecture/adr/0023-panier-serveur.md) — panier serveur, avec tes choix du 2026-10-10 :

| Question                                  | Ton choix                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| Découpage du sprint (S5-T01 à S5-T08)     | Tel quel (voir le planning)                                               |
| Compte pour commander ?                   | **Obligatoire**                                                           |
| Deux paniers à la connexion ?             | **Additionner**                                                           |
| Où vit le panier d'un client connecté ?   | **Sur le serveur seul**                                                   |
| Durée de conservation                     | **90 jours** sans activité                                                |
| Paiement à la livraison (villes, plafond) | Pas encore fixé → valeurs provisoires dans un réglage serveur au S5-T04   |
| Coupons cumulables ?                      | Pas encore décidé → non cumulable par défaut, réglable, au S5-T03         |
| Mobile Money : agrégateur ou direct ?     | Pas encore décidé → simulateur maison au S5-T05, vrai fournisseur ensuite |

Les trois questions en attente sont notées dans les [questions ouvertes](../architecture/regles-metier.md#questions-ouvertes).

- **Le panier ne réserve pas le stock** : la réservation se fera dans la transaction de la commande (BR-012, S5-T02).
- **Le site sait qu'on est connecté sans appeler l'API** : le layout regarde seulement si le cookie de session existe. Next.js redessine
  le layout après une connexion ou une déconnexion (les actions posent ou effacent ce cookie) : le panier bascule tout seul.
- « Compte obligatoire pour commander » s'appliquera avec le **vrai tunnel** (S5-T07) ; le tunnel actuel reste la maquette du S2.

## 4. Sécurité

- **Aucun prix venu du navigateur** : ni enregistré, ni accepté (schémas stricts : un champ `price` donne 400).
- **Chacun son panier** : toutes les requêtes partent du compte de la session, jamais d'un identifiant envoyé par le site (testé : Ben ne voit ni ne vide le panier d'Awa).
- **Concurrence** : chaque modification verrouille le panier dans une transaction (testé : 6 ajouts simultanés → 6 articles, un seul panier).
- **UUID** : ramenés en minuscules partout (API, catalogue, site) — une variante écrite en majuscules ne fait jamais une deuxième ligne (leçon du S4-T06).
- **Journaux** : ni jeton ni contenu du panier, côté site comme côté API (l'identifiant de variante est masqué dans le chemin journalisé).

**Relecture de sécurité indépendante** (agent séparé, avant la PR) : aucun problème critique ou élevé. Corrigé :

| Gravité | Trouvé                                                                                                                                         | Correction                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Moyen   | La réunion pouvait être appliquée **deux fois** (réponse perdue après l'enregistrement, ou double lancement) → quantités doublées              | Réunion **idempotente** : identifiant tiré par le navigateur, dernière réunion retenue en base (`last_merge_id`) |
| Faible  | Rafale de demandes d'un même compte : chacune garde une connexion à la base en attendant le verrou → les autres clients pouvaient être bloqués | Attente du verrou bornée à **1 s** (`lock_timeout`) → `PANIER_OCCUPE` (409, `Retry-After: 1`)                    |
| Faible  | Panier du navigateur vidé **avant** l'envoi : perdu si l'onglet se ferme pendant la réunion                                                    | Vidé seulement **après** la réponse (l'idempotence rend le renvoi sans danger)                                   |
| Faible  | Double lancement : un affichage pouvait arriver avant la réunion                                                                               | Les deux lancements envoient la même réunion : les deux réponses montrent le panier réuni                        |
| Info    | Variante visible dans les journaux de l'API (`/cart/items/<uuid>`)                                                                             | Chemin journalisé : `/cart/items/{variantId}`                                                                    |
| Info    | Le catalogue écartait un UUID en majuscules (et le panier aurait retiré la ligne)                                                              | Comparaison en minuscules dans `describeLines`                                                                   |
| Info    | Premier ménage seulement 1 h après le démarrage (la démo s'endort avant)                                                                       | Premier passage 5 min après le démarrage                                                                         |
| Info    | Le déclencheur des 50 lignes aurait donné une erreur 500                                                                                       | Traduit en `PANIER_PLEIN`                                                                                        |

Gardé tel quel (expliqué dans l'ADR) : une variante d'un produit repassé en brouillon reste affichée dans le panier, signalée
« plus disponible » (le client doit savoir quoi retirer ; l'identifiant n'est pas devinable).

Aucun secret dans Git ; **aucun `.env` ni réglage Render modifié**.

## 5. Qualité

| Vérification                      | Résultat                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tests du site                     | **245** réussis (214 à la fin du S4) : panier serveur, réunion idempotente, retour au panier du navigateur, actions, adaptateur API                                      |
| Tests unitaires de l'API          | **368** réussis (354) : domaine du panier, alignement des limites (contrat = domaine = SQL = navigateur), chemin journalisé                                              |
| Tests d'intégration (vraie base)  | **88** réussis (69) : 18 sur le panier par HTTP (BR-001, BR-004, réunion, idempotence, verrou, 50 lignes, ménage, isolement) + 1 sur les colonnes supprimées             |
| Contrat                           | 15 réussis ; OpenAPI régénérée (`docs/api/openapi.json`, 1.7.0)                                                                                                          |
| Bout en bout (local, avant la PR) | **54** réussis (27 scénarios × téléphone + ordinateur), dont le nouveau : panier ajouté en visiteur → inscription → retrouvé sur un 2ᵉ appareil → vide après déconnexion |
| Lint, types, format, builds       | ✅ (site, API, contrat)                                                                                                                                                  |

La vérification `db:check` (migration = schéma Prisma) ne peut pas tourner dans mon environnement (moteur Prisma bloqué) : elle tourne en CI.
La relecture a comparé à la main tables, index, clés et valeurs par défaut avec le schéma.

## 6. Captures d'écran

Panier d'un client connecté avec un article dont le stock a baissé : message « Plus que 1 en stock : diminuez la quantité pour commander. »,
total sans cet article, bouton « Commander » grisé avec l'explication. (Visible en local : se connecter, ajouter un article, baisser son stock en base.)

## 7. Limites connues / dette technique

- Seule la dernière réunion est retenue par panier : un cas très rare (réponse perdue **puis** panier du navigateur modifié) peut encore compter deux fois des quantités (bornées).
- Le tunnel de commande reste la maquette du S2 : commande réservée aux comptes et vraie commande au S5-T02 / S5-T07.
- Un client connecté fait un appel à l'API au premier chargement de chaque visite (aucun pour un visiteur).
- Pour la démo : la migration s'applique au démarrage (`start-demo.js`), rien à régler sur Render.

## 8. Prochaines étapes

- Fusion de la PR (c'est toi qui fusionnes).
- **S5-T02** : création de la commande depuis le panier vérifié — frais de livraison calculés par l'API, **réservation du stock dans la
  même transaction** (BR-012), statuts, annulation (BR-010), idempotence. Je te poserai d'abord les questions de choix (format du numéro de
  commande, durée de réservation avant paiement, etc.).
- À transmettre au client : villes et plafond du paiement à la livraison, cumul des coupons, choix Mobile Money (agrégateur ou direct) et comptes marchands.
