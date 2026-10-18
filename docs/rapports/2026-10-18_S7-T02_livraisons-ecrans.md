# Rapport — S7-T02 : livraisons à l'écran

|                                                 |                                                           |
| ----------------------------------------------- | --------------------------------------------------------- |
| **Date**                                        | 2026-10-18                                                |
| **Sprint / tâches**                             | S7 — S7-T02                                               |
| **Version**                                     | v0.7.0 → (v0.8.0 à la clôture du S7) ; contrat 1.21.0     |
| **Sections du cahier d'architecture modifiées** | §3.7, §3.22, §5.15, §5.16, §5.17 (nouvelle) — version 4.8 |

## 1. Résumé

L'équipe suit maintenant les livraisons **depuis le site** : commandes prêtes, remise au transporteur, échec, nouvelle
tentative, livraison, annulation, et réglage du **barème**. Le **client** voit où en est sa livraison et reçoit un
e-mail « en route » puis « livrée ». Le **vendeur** voit si sa commande attend le livreur, est en route ou livrée. Le
site affiche enfin le **barème de l'API** (gardé 5 minutes), au lieu de celui écrit dans le code.

```
Équipe /equipe/livraisons : Prêtes ─► Remettre au transporteur ─► fiche : livrée | échec ─► nouvelle tentative | annulation
Client /compte/commandes/{n°} : section « Livraison » + e-mails « en route », « livrée »
Vendeur /vendeur/commandes : « En attente du livreur », « En livraison », « Livrée au client »
```

## 2. Fonctionnalités livrées

| Tâche  | Description                                                                                                                       | Fichiers principaux                                                                     |
| ------ | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| S7-T02 | Route client `GET /orders/{n°}/shipment` : état, tentative, étapes — sans motif, transporteur ni parts                            | `modules/shipping/interface/customer-shipment.controller.ts`                            |
| S7-T02 | E-mails « en route » et « livrée » : file en base écrite avec l'étape, envoi chaque minute (réservation, 5 essais)                | `modules/shipping/application/shipment-notifier.service.ts`, migration `20261018100000` |
| S7-T02 | `/equipe/livraisons` (onglets, remise), `/equipe/livraisons/{n°}` (étapes), `/equipe/livraisons/bareme` ; menu et tableau de bord | `app/equipe/livraisons/`, `lib/staff/actions.ts`, `lib/staff/api-staff.ts`              |
| S7-T02 | Section « Livraison » de la commande du client ; état de la livraison côté vendeur (lecture seule)                                | `app/compte/commandes/[reference]/page.tsx`, `lib/vendor/labels.ts`                     |
| S7-T02 | Barème de l'API sur le site (fiche produit, panier, ville, caisse, page « Livraison »), gardé 5 min, relu en arrière-plan         | `lib/shipping/api-tariffs.ts`, `components/providers/DeliveryTariffsProvider.tsx`       |

## 3. Décisions techniques

[ADR-0041](../architecture/adr/0041-livraisons-ecrans.md). Choix du propriétaire du 2026-10-18 : barème lu une fois et
gardé 5 minutes ; e-mails « en route » et « livrée » ; état de la livraison pour le client ; vendeur en lecture seule.

Le layout du site ne fait toujours **aucun appel bloquant** : le barème gardé est rendu tout de suite, relu en
arrière-plan ; seule la toute première lecture attend (1 s au plus). La réserve de l'ADR-0040 (« ne pas changer le
barème ») est levée.

## 4. Sécurité

- Route client : seulement les commandes du compte (une commande d'autrui est « introuvable »), `no-store`, aucun
  champ interne (motif, transporteur, parts, auteur des étapes).
- Pages et actions des livraisons : **administrateurs** avec double authentification (site ET API) ; numéro, étape,
  motif et barème revérifiés par l'action avant l'API ; messages en liste fermée ; rappel de n'écrire aucune donnée du
  client dans un motif.
- E-mails : mis en file **dans la transaction** de l'étape, envoyés seulement à une adresse vérifiée, HTML échappé,
  seulement le numéro de commande et la ville.
- La clé interne ne sert que dans des fichiers `server-only` ; le navigateur ne reçoit que le barème (public).
- **Relecture de sécurité indépendante** (agent séparé, sur le diff) : aucun problème grave ni moyen. Quatre points
  **bas**, tous traités : réponse du barème lue sur 16 Ko au plus ; « en route » plus envoyé après un échec noté entre
  temps ; erreurs d'envoi journalisées sans leur message (il peut contenir l'adresse) ; double envoi possible si la
  base tombe juste après un envoi (normal pour une file d'e-mails, documenté dans l'ADR-0041). Téléphone de la fixture
  e2e remplacé par un numéro manifestement fictif.

## 5. Qualité

| Vérification                                                               | Résultat                                                                     |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| format:check, lint, typecheck                                              | ✅                                                                           |
| Tests unitaires de l'API                                                   | ✅ 72 fichiers, 575 tests                                                    |
| Tests unitaires du site                                                    | ✅ 57 fichiers, 415 tests                                                    |
| Tests du contrat                                                           | ✅ 32 tests                                                                  |
| Tests d'intégration (base `kemdia_test`)                                   | ✅ 19 fichiers, 201 tests                                                    |
| Build (site sur une API injoignable)                                       | ✅                                                                           |
| Gitleaks v8.30.1 (empreinte vérifiée), Semgrep 1.179.0                     | ✅ aucun secret ; 1 faux positif (HTML échappé, comme l'e-mail aux vendeurs) |
| Playwright + axe (CI) : parcours de l'équipe prolongé (livraisons, barème) | voir la CI de la PR                                                          |

Nouveaux tests : `shipment-notifier.service.test.ts` (réservation, abandon, panne, délais), `shipment-mailer.test.ts`
(contenu, échappement), `api-tariffs.test.ts` (5 minutes, arrière-plan, API injoignable, réponse trop lourde, 1 s),
`delivery-state.test.ts` (vendeur), actions serveur des livraisons et du barème, scénario client dans
`shipping.int.test.ts`, parcours e2e de l'équipe (`equipe.spec.ts`, profil mobile).

## 6. Captures d'écran

Faites par la CI (Playwright) sur le profil mobile : liste des livraisons, fiche d'une livraison, barème.

## 7. Limites connues / dette technique

- Un barème changé apparaît sur le site en **5 minutes au plus** (le total au paiement, lui, change tout de suite).
- Une nouvelle tentative de livraison ne renvoie pas d'e-mail « en route ».
- Le vendeur ne peut pas signaler « colis prêt » : l'équipe s'organise avec lui (écarté pour l'instant).
- Transporteur toujours « manuel » (question n° 5).

## 8. Prochaines étapes

- **Après la fusion** : `pnpm --filter @kemdia/api db:deploy` puis `db:check` ; attendre la fin du job « Déploiement
  DÉMO (Render) ». Rien à régler sur Render (guide de la démo, étape 12).
- S7-T03 : accueil sous 300 ms.
