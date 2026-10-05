# ADR-0004 — Panier invité stocké dans le navigateur, montants toujours recalculés par le serveur

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

Dans l'ancien projet, les montants pouvaient être faussés (coupon déduit deux fois, total à 0 FCFA,
validation de paiement contournable : HIGH-05, CRIT-01). Le Sprint 1 n'a pas encore de backend.

## Décision

- Le panier des visiteurs est conservé dans le `localStorage` du navigateur (clé `kemdia.cart.v1`).
- Il est traité comme **donnée non fiable** : chaque ligne est validée au chargement
  (types, bornes de quantité, image limitée à `/images/…`), le reste est ignoré.
- Les prix qu'il contient sont **indicatifs**, affichés comme tels.
- À la commande (S5), seuls `{ productId, quantity }` seront envoyés. Le serveur relira prix, stock, promotions,
  frais de livraison et calculera le total. Aucun montant venant du navigateur ne sera utilisé.
- Après connexion (S4), le panier sera fusionné avec un panier serveur.

## Conséquences

- Fonctionne hors connexion et sans compte, rapide sur mobile.
- Une manipulation du `localStorage` ne peut, au pire, que fausser l'affichage chez l'attaquant lui-même.
