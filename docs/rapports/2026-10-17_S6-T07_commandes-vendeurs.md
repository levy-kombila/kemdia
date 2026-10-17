# Rapport — S6-T07 : commandes des vendeurs (BR-013)

|                                                 |                                                     |
| ----------------------------------------------- | --------------------------------------------------- |
| **Date**                                        | 2026-10-17                                          |
| **Sprint / tâches**                             | S6 — S6-T07                                         |
| **Version**                                     | v0.5.0 ; contrat de l'API **1.18.0** (1.17.0 avant) |
| **Sections du cahier d'architecture modifiées** | §3.20 (nouvelle), §5.16 ; version **4.4**           |

## 1. Résumé

Un vendeur sait maintenant qu'il a vendu. Chaque commande est découpée en une part par boutique. Le vendeur voit **ses**
articles et la ville de livraison, puis **accepte ou refuse** sous 24 heures. Un refus, ou l'absence de réponse, annule la
commande entière. Quand toutes les boutiques ont accepté, la commande passe « en préparation ». Le vendeur reçoit un e-mail à
chaque nouvelle commande, et l'espace vendeur a ses pages « Mes commandes ».

## 2. Fonctionnalités livrées

| Partie  | Description                                                                                                                                                                          | Fichiers principaux                                                                                                        |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Base    | Table `orders.order_shop_parts`, colonne `order_items.shop_id`, règles SQL (décision figée, part Kemdia acceptée), commandes existantes reprises                                     | `prisma/migrations/20261017100000_commandes_vendeurs/`                                                                     |
| Domaine | Parts par boutique, délai de 24 h, motif de refus                                                                                                                                    | `orders/domain/shop-part.ts`                                                                                               |
| API     | `GET /vendors/orders`, `GET /vendors/orders/{référence}`, `POST …/accept`, `POST …/refuse` ; expiration chaque minute ; annulation (stock, coupon, remboursement « à faire », avoir) | `orders/application/vendor-orders.service.ts`, `vendors/application/vendor-order.service.ts`, `vendor-order.controller.ts` |
| E-mail  | « Nouvelle commande » au vendeur, après la transaction, avec reprises (5 essais au plus)                                                                                             | `vendors/application/vendor-order-notifier.service.ts`, `vendor-order-mailer.ts`                                           |
| Site    | `/vendeur/commandes` (onglets par statut) et `/vendeur/commandes/{référence}` (articles, échéance, accepter, refuser avec motif) ; lien « Mes commandes » au menu                    | `app/vendeur/commandes/**`, `lib/vendor/{api-vendor,actions,labels,messages}.ts`                                           |
| Client  | Raisons d'annulation lisibles dans « Mes commandes » : un vendeur n'a pas pu la préparer, ou n'a pas répondu à temps                                                                 | `app/compte/commandes/[reference]/page.tsx`                                                                                |

## 3. Décisions techniques

[ADR-0038](../architecture/adr/0038-commandes-vendeurs.md). Choix du propriétaire (2026-10-17) : **24 h** pour répondre ;
refus ou silence = **commande entière annulée** ; écrans **dans la même tâche**.

## 4. Sécurité

- Le vendeur ne voit **jamais** le nom, le téléphone ni l'adresse du client : seulement ses articles et la ville.
- La boutique vient toujours de la session (rôle vendeur, boutique active relue sous verrou), jamais de la requête. Une
  commande sans produit de la boutique répond 404.
- Commande verrouillée pour décider ; une décision ne change plus (déclencheur SQL) ; décider et expirer ne se chevauchent pas.
- Motif de refus gardé chez Kemdia, jamais montré au client ; e-mail sans donnée du client, HTML échappé.
- Site : référence vérifiée (`KMD-XXXXXX`) avant toute adresse ; avis et erreurs en liste fermée ; formulaires sans JavaScript.

**Relecture de sécurité indépendante** (agent séparé) : **aucun constat bloquant**. Corrigé :

| Gravité | Constat                                                                                                                        | Correction                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Moyenne | Une commande à la livraison encaissée avant la réponse du vendeur ne pouvait plus être annulée à l'échéance : bloquée sans fin | Encaissement en espèces **refusé tant qu'un vendeur n'a pas répondu** (test d'intégration) |
| Basse   | Commande verrouillée ailleurs : le vendeur recevait « panier occupé »                                                          | Traduit en `BOUTIQUE_OCCUPEE` (« réessayez »)                                              |
| Info    | Le message d'annulation impossible révélait au vendeur que le client avait payé en espèces                                     | Texte neutre                                                                               |
| Info    | Motif compté en unités UTF-16 sur le site, en caractères dans l'API                                                            | Compté en caractères des deux côtés                                                        |

Gardés (bas, documentés dans l'ADR) : commandes créées par l'ancienne API pendant les minutes du redéploiement (sans part,
rattrapage SQL si le cas se présente) ; ligne d'un produit supprimé rattachée à la boutique Kemdia (les produits ne sont
jamais supprimés, seulement retirés de la vente).

Semgrep 1.179.0 sur les fichiers changés : aucun constat de sécurité réel (HTML de l'e-mail échappé : faux positif ;
mots de passe publics des comptes de test e2e, déjà connus). Gitleaks 8.30.1 (empreinte vérifiée) : aucune fuite dans les
commits de la branche.

## 5. Qualité

| Vérification                                   | Résultat                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Format, lint, types                            | ✅                                                                                                              |
| Build (site construit sur une API injoignable) | ✅ (`/vendeur/commandes` et sa fiche : pages serveur, 0 Ko de JavaScript ajouté)                                |
| Tests unitaires API                            | ✅ 546 (543 avant)                                                                                              |
| Tests d'intégration (`kemdia_test`)            | ✅ 191 (181 avant) : parts, isolement, accepter, refuser, délai, Mobile Money, e-mail, règles SQL, encaissement |
| Tests unitaires du site                        | ✅ 399 : adaptateur (référence vérifiée, adresses, codes), actions (motif, redirections)                        |
| Tests du contrat                               | ✅ 32                                                                                                           |
| Playwright + axe                               | Nouveau parcours « Mes commandes » (profil mobile) : **lancé par la CI** de la PR                               |

## 6. Captures d'écran

Pas de captures dans cette tâche, pour économiser le temps d'utilisation : les pages se vérifient sur la démo après la fusion.

## 7. Limites connues / dette technique

- Un seul refus annule toute la commande (choix MVP) ; pas d'annulation partielle.
- Le remboursement d'une commande payée et refusée reste à faire à la main (comme depuis le S5-T04).
- Le parcours Playwright ne passe pas encore une vraie commande jusqu'à l'acceptation : ce chemin est couvert par les tests
  d'intégration de l'API.
- Le tableau de bord du vendeur ne compte pas encore les commandes « à traiter » (le menu mène à la liste).

## 8. Prochaines étapes

- Après la fusion : `db:deploy` puis `db:check` ; attendre la fin du job « Déploiement DÉMO (Render) » avant de tester.
- S6-T08 : KYC des vendeurs (BR-024), puis clôture du S6 (v0.7.0). Commissions (BR-020) dès la réponse du client.
