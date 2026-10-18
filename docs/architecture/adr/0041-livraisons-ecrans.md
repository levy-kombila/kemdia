# ADR-0041 — Livraisons à l'écran : équipe, client, vendeur, barème du site

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Tâche** : S7-T02
- **Complète** : [ADR-0040](0040-livraisons-module-shipping.md) (module `shipping`), [ADR-0036](0036-ecrans-equipe.md)
  (écrans de l'équipe), [ADR-0037](0037-espace-vendeur.md) (espace vendeur), [ADR-0038](0038-commandes-vendeurs.md)
  (e-mails aux vendeurs)

## Contexte

Le S7-T01 a livré les livraisons **dans l'API seulement**. Il manquait : les écrans de l'équipe pour suivre les
livraisons et régler le barème, ce que voient le client et le vendeur, et le **barème sur le site**. Le site estimait
encore les frais avec le barème écrit dans le code : changer le barème dans l'API aurait montré un montant puis facturé
un autre (refus `PRIX_MODIFIE` à la caisse).

Le layout du site ne fait **aucun appel à l'API** (choix du S5-T01) : sur la démo, l'API s'endort et chaque page
attendrait son réveil.

Choix du propriétaire (2026-10-18) :

| Question            | Choix                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------ |
| Barème sur le site  | **Lu une fois, gardé 5 minutes** ; API injoignable : barème du contrat                     |
| E-mails au client   | **« En route » et « livrée »** (jamais le motif d'un échec)                                |
| Suivi par le client | **État de la livraison** (route client) : sans motif, ni transporteur, ni parts des frais  |
| Côté vendeur        | **Lecture seule** : le vendeur voit si sa commande attend le livreur, est en route, livrée |

## Décision

1. **Route client** `GET /api/v1/orders/{n°}/shipment` (module `shipping`, session ouverte) : seulement les commandes
   du compte (`OrderShipping.findForAccount`) ; réponse `CustomerShipment` = état, tentative, dates et étapes. Ni le
   motif écrit par l'équipe, ni le transporteur, ni les parts BR-021. Contrat **1.21.0**.
2. **E-mails au client** : table `shipping.shipment_emails` (une ligne par expédition et par sorte), écrite **dans la
   transaction** de la remise et de la livraison ; envoyée **après**, chaque minute, par `ShipmentNotifier` : réservation
   conditionnelle (deux instances n'envoient pas le même), 5 essais (1 min, 10 min, 1 h, 6 h), abandon si l'e-mail n'a
   plus d'objet (« en route » d'une commande déjà livrée ou annulée) ou si le client n'a pas d'adresse vérifiée. Même
   transport que les factures (`EMAIL_TRANSPORT`) : aucune nouvelle variable.
3. **Barème du site** : le serveur du site lit `GET /shipping/tariffs` et le **garde en mémoire 5 minutes** ; passé ce
   délai, la valeur gardée est rendue **tout de suite** et relue en arrière-plan. Seule la toute première lecture attend,
   **1 s au plus**, puis prend le barème du contrat. Le layout le transmet aux composants du navigateur
   (`DeliveryTariffsProvider`, `useDeliveryEstimate`) : fiche produit, panier, choix de la ville, caisse, page « Livraison ».
   Le devis de l'API fait toujours foi au paiement.
4. **Écrans de l'équipe** (administrateurs, double authentification) : `/equipe/livraisons` (onglets Prêtes, En route,
   Échecs, Livrées, Annulées ; « Remettre au transporteur » depuis la liste), `/equipe/livraisons/{n°}` (frais, parts,
   étapes ; livrée, échec avec motif, nouvelle tentative, annulation avec note — rappel de n'y écrire aucune donnée du
   client), `/equipe/livraisons/bareme` (4 zones). Compteur « commandes à remettre au transporteur » au tableau de bord,
   lien « Livraisons » dans le menu de l'équipe.
5. **Client** : section « Livraison » sur `/compte/commandes/{n°}` dès la remise au transporteur. **Vendeur** : badge
   « En attente du livreur », « En livraison », « Livrée au client » sur ses commandes acceptées (champ `orderStatus`
   déjà présent : aucun changement d'API).

## Conséquences

- La réserve de l'ADR-0040 (« ne pas changer le barème avant le S7-T02 ») est levée : un changement apparaît sur le site
  en **5 minutes au plus** ; pendant ce délai, un client voit l'ancien montant estimé, puis le bon total au devis.
- Aucun appel bloquant ajouté aux pages : sur la démo endormie, le site s'affiche avec le barème gardé (ou du contrat).
- Chaque instance du site garde son propre barème (pas de cache partagé) : au plus une lecture toutes les 5 minutes par
  instance.
- E-mails : si la base tombe juste après un envoi (avant « envoyé »), le même e-mail peut repartir à l'essai suivant
  (5 au plus) ; deux instances, elles, n'envoient jamais le même. « En route » n'est envoyé que si la livraison est
  encore en route ; une nouvelle tentative ne renvoie pas d'e-mail (un seul « en route » par commande).
- Relecture de sécurité : réponse du barème lue sur 16 Ko au plus ; erreurs d'envoi journalisées sans leur message
  (il peut contenir l'adresse du client).
- Après une fusion : `db:deploy` puis `db:check` (nouvelle table).

## Alternatives écartées

- **Lire le barème à chaque page** : toujours exact, mais un appel de plus par page, contre l'objectif « accueil sous
  300 ms » (S7-T03) et bloquant sur la démo endormie.
- **Cache de Next.js (`revalidate`)** : un échec n'y est pas gardé (chaque page réessaie et attend) ; notre cache rend la
  valeur gardée sans attendre, comme l'adaptateur du catalogue.
- **E-mail d'échec de livraison** : écarté par le propriétaire ; le service client rappelle le client.
- **Bouton « prêt à expédier » pour le vendeur** : une étape de plus pour tous ; reporté si les vendeurs le demandent.
