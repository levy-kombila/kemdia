# Rapport — S7-T01 : livraisons, module `shipping`

|                                                 |                                                       |
| ----------------------------------------------- | ----------------------------------------------------- |
| **Date**                                        | 2026-10-17                                            |
| **Sprint / tâches**                             | S7 — S7-T01                                           |
| **Version**                                     | v0.7.0 → (v0.8.0 à la clôture du S7) ; contrat 1.20.0 |
| **Sections du cahier d'architecture modifiées** | §3.3, §3.7, §3.22 (nouvelle) — version 4.7            |

## 1. Résumé

Une commande peut maintenant être suivie **jusqu'à la livraison** : un administrateur la remet au transporteur, note
un échec, relance une tentative, la note livrée, ou l'annule si la livraison est impossible. Kemdia connaît **sa part
de 15 %** sur chaque frais de livraison (BR-021). Le **barème des zones** n'est plus écrit dans le code : un
administrateur le règle sans PR. Le transporteur n'étant pas choisi (question n° 5), l'équipe suit les livraisons **à la
main** ; le vrai transporteur se branchera plus tard sans tout refaire.

```
Commande prête (payée ou à la livraison, vendeurs d'accord) ─► remise au transporteur : « expédiée », part Kemdia
   ─► livrée   |   échec (motif) ─► nouvelle tentative  ou  annulation : stock et coupon rendus, remboursement « à faire »
```

## 2. Fonctionnalités livrées

| Tâche  | Description                                                                                                                                                                         | Fichiers principaux                                                                                        |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| S7-T01 | Barème des 4 zones en base (`GET /shipping/tariffs` public, `GET\|PUT /admin/shipping/tariffs`), lu par le devis et la commande                                                     | `modules/shipping/application/tariff.service.ts`, `modules/orders/application/delivery-tariffs.ts`         |
| S7-T01 | Expéditions : commandes prêtes, remise au transporteur, livrée, échec, nouvelle tentative (20 au plus), annulation après échec ; historique en ajout seul ; transporteur « manuel » | `modules/shipping/application/shipment.service.ts`, `modules/orders/application/order-shipping.service.ts` |
| S7-T01 | Part de Kemdia 15 % arrondie à l'entier inférieur, le reste au transporteur (BR-021), figée et vérifiée en base                                                                     | `modules/shipping/domain/shipment.ts`, migration `20261017150000_livraisons`                               |
| S7-T01 | Commande « expédiée » annulable après un échec (raison `livraison_echec`) ; remboursement « à faire » d'un paiement Mobile Money et avoir (module payments)                         | `modules/payments/application/payment.service.ts`, `modules/orders/domain/order.ts`                        |
| S7-T01 | Site : libellé de la nouvelle raison d'annulation sur la page d'une commande du client                                                                                              | `apps/web/src/app/compte/commandes/[reference]/page.tsx`                                                   |

## 3. Décisions techniques

[ADR-0040](../architecture/adr/0040-livraisons-module-shipping.md). Choix du propriétaire du 2026-10-17 : port neutre et
suivi manuel ; barème en base ; arrondi à l'entier inférieur ; administrateur seul ; échec = nouvelle tentative ou
annulation ; API seule (écrans au S7-T02).

Le module `shipping` dépend de `orders` (ports `OrderShipping` et `DeliveryTariffs`), jamais l'inverse : `orders` lit
le barème par une **inscription** au démarrage, comme les crochets d'annulation du module payments.

## 4. Sécurité

- Routes de suivi et de réglage : **administrateurs** avec double authentification confirmée (< 15 min), limites par
  adresse et par compte, `Cache-Control: no-store`, chaque étape au **journal d'audit** (`shipment.*`,
  `settings.delivery_updated`) dans la même transaction.
- La liste des commandes prêtes ne montre **ni le nom, ni le téléphone, ni l'adresse** du client.
- Motif et note nettoyés (caractères de contrôle et invisibles retirés, 3 à 200 caractères).
- Règles SQL : parts des frais, passages de statut, champs figés de l'expédition, historique en ajout seul, bornes du
  barème ; la commande ne passe « expédiée → annulée » que par le module shipping (jamais par le client).
- Ordre des verrous : commande → expédition → paiements ; actions répétées sans effet (double clic).
- **Relecture de sécurité indépendante** (agent séparé, sur le diff) : aucun contournement d'accès ni montant
  faussable. Un problème **moyen**, corrigé : un motif ou une note de 101 à 200 caractères dépassait la limite du
  journal d'audit (100) et bloquait l'étape (erreur 500) → texte coupé à 100 caractères au journal, gardé en entier
  sur l'expédition (test d'intégration ajouté). Trois points **bas** : commentaires du journal alignés (corrigé) ;
  texte libre pouvant contenir des données du client (rappel à mettre dans l'écran du S7-T02) ; pendant un
  déploiement progressif, ne pas changer le barème tant que l'ancienne version tourne (noté au §7).

## 5. Qualité

| Vérification                                                    | Résultat                   |
| --------------------------------------------------------------- | -------------------------- |
| format:check, lint, typecheck                                   | ✅                         |
| Tests unitaires de l'API (dont domaine `shipping`, alignements) | ✅ 70 fichiers, 567 tests  |
| Tests du contrat                                                | ✅ 32 tests                |
| Tests d'intégration (base `kemdia_test`)                        | ✅ 19 fichiers, 200 tests  |
| Tests unitaires du site                                         | ✅ 55 fichiers, 404 tests  |
| Build (site sur une API injoignable)                            | ✅                         |
| Gitleaks v8.30.1 (empreinte vérifiée), Semgrep 1.179.0          | ✅ aucun secret, 0 constat |

Nouveaux tests : `shipment.test.ts` (parts, statuts, motif, barème), `shipping-alignment.test.ts` (contrat = domaine =
migration), `shipping.int.test.ts` (5 scénarios par HTTP sur une vraie base : barème, remise et livraison, échec puis
annulation avec remboursement, refus, règles de la base).

## 6. Captures d'écran

Aucune : tâche **API seule** (écrans au S7-T02).

## 7. Limites connues / dette technique

- **Ne pas changer le barème avant le S7-T02** : le site affiche encore le barème du contrat ; un barème changé
  donnerait un autre total au moment de payer (refusé proprement par `PRIX_MODIFIE`, mais déroutant).
- Les **suppléments par ville** restent dans le contrat (une PR pour les changer).
- Une commande à la livraison notée « livrée » n'est pas encaissée automatiquement : l'encaissement reste une action
  à part (`cod-collected`).
- Transporteur « manuel » : pas d'échange automatique tant que la question n° 5 n'est pas tranchée.
- Déploiement : tant que l'ancienne version de l'API tourne encore (25 à 30 minutes sur la démo), ne pas changer le
  barème ni annuler d'expédition.
- Motif et note sont du texte libre : l'écran du S7-T02 rappellera de n'y mettre ni nom ni téléphone du client.

## 8. Prochaines étapes

- **Après la fusion** : sur la base de la démo et sur ton poste, `pnpm --filter @kemdia/api db:deploy` puis
  `db:check` ; attendre la fin du job « Déploiement DÉMO (Render) ».
- S7-T02 : écrans des livraisons (`/equipe`, `/compte`, `/vendeur`) et site branché sur le barème de l'API.
- Client : question n° 5 (transporteur) toujours ouverte.
