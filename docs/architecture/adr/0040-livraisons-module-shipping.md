# ADR-0040 — Livraisons : module `shipping`, barème réglable, part de Kemdia (BR-021)

- **Statut** : Accepté
- **Date** : 2026-10-17
- **Tâche** : S7-T01
- **Complète** : [ADR-0006](0006-monolithe-modulaire-7-modules.md) (modules), [ADR-0024](0024-commandes-reservation-stock.md)
  (commandes, frais de livraison), [ADR-0026](0026-paiements.md) (remboursements « à faire »),
  [ADR-0038](0038-commandes-vendeurs.md) (commandes des vendeurs)

## Contexte

Jusqu'au S6, une commande s'arrêtait à « confirmée » ou « en préparation » : rien ne la faisait passer « expédiée »
puis « livrée ». Les frais de livraison étaient écrits dans le code (`@kemdia/contracts/delivery`) : changer un tarif
demandait une PR. La règle **BR-021** donne à Kemdia **15 %** de chaque frais de livraison facturé.

Le **transporteur n'est pas choisi** (question ouverte n° 5 : COMAT ? API, fichier, WhatsApp ?).

Choix du propriétaire (2026-10-17) :

| Question                    | Choix                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| Transporteur                | **Port neutre + suivi manuel** : l'équipe note chaque étape ; le vrai transporteur viendra   |
| Barème                      | **En base, réglable** par un administrateur ; valeurs de départ = celles du contrat          |
| Arrondi de la part (BR-021) | **Entier inférieur** : jamais plus de 15 % pour Kemdia, le reste au transporteur             |
| Qui change les statuts      | **Administrateur seul** (double authentification), comme l'encaissement à la livraison       |
| Échec de livraison          | **Nouvelle tentative ou annulation** de la commande (stock rendu, remboursement « à faire ») |
| Écrans                      | **API seule** dans cette tâche ; les écrans `/equipe`, `/compte`, `/vendeur` viennent au T02 |

## Décision

1. **Nouveau module `shipping`** (schéma PostgreSQL `shipping`). Il dépend du module `orders` par son port public,
   jamais l'inverse :
   - `OrderShipping` (nouveau port de `orders`) : liste des commandes prêtes, remise au transporteur (confirmée →
     en préparation → expédiée), livrée, annulation après échec (stock, coupon, puis les modules inscrits) ;
   - `DeliveryTariffs` : le module `shipping` **s'inscrit** au démarrage pour fournir le barème ; le devis et la
     commande le lisent **dans leur transaction**. Sans inscription (tests), barème du contrat.
2. **Barème** (`shipping.delivery_tariffs`, une ligne par zone) : frais de base, seuil de livraison offerte, délais.
   Les **noms des zones et les suppléments par ville restent dans le contrat**. Le total attendu envoyé par le site
   (`expectedTotal`) protège le client d'un changement de barème entre le devis et la commande (`PRIX_MODIFIE`).
3. **Expédition** (`shipping.shipments`, une par commande) créée à la remise au transporteur, avec ses frais et ses
   parts figés. Statuts : `in_transit` → `delivered` | `failed` ; `failed` → `in_transit` (nouvelle tentative, 20 au
   plus) | `cancelled`. « À préparer » n'est pas un statut : c'est une commande prête sans expédition. Historique en
   ajout seul (`shipment_events`, avec l'administrateur).
4. **Commande** : nouveau passage **expédiée → annulée** (raison `livraison_echec`), permis par le déclencheur SQL,
   **jamais** par le client. Le module `payments` s'inscrit (`onDeliveryCancel`) pour rembourser (« à faire ») un
   paiement Mobile Money, expirer les essais en attente et émettre un avoir ; espèces déjà encaissées : refus.
5. **Part de Kemdia** = `floor(frais × 15 / 100)`, transporteur = le reste. Vérifiée par une règle SQL
   (`kemdia_share = (delivery_fee * 15) / 100`). Livraison offerte : 0 et 0.
6. **Transporteur** : port `Carrier`, adaptateur `ManualCarrier` (`« manuel »`, aucun échange). Un vrai transporteur =
   un nouvel adaptateur, sans changer le reste.
7. **Routes** : `GET /shipping/tariffs` (public) ; `GET|PUT /admin/shipping/tariffs` ;
   `GET /admin/shipping/ready`, `GET /admin/shipping/shipments?status=…`, `GET /admin/shipping/shipments/{n°}`,
   `POST …/{n°}/hand-over|delivered|failed|retry|cancel` — administrateurs, double authentification confirmée,
   60 requêtes par minute, chaque étape au journal d'audit (`shipment.*`, `settings.delivery_updated`). Répéter une
   action déjà faite renvoie l'expédition sans rien changer. Contrat **1.20.0**.

## Conséquences

- Une commande peut enfin être suivie jusqu'à « livrée » ; la part de Kemdia est connue pour chaque livraison.
- Changer un tarif ne demande plus de PR. **Tant que le S7-T02 n'est pas livré**, le site affiche encore le barème du
  contrat : ne pas changer le barème avant (le client verrait un autre montant au moment de payer, refusé par
  `PRIX_MODIFIE`).
- Ordre des verrous : commande → expédition → (paiements). Toutes les écritures d'une étape (commande, expédition,
  historique, journal d'audit, remboursement) sont faites ensemble ou pas du tout.
- La migration est **d'ajout** : la version précédente de l'API ignore le schéma `shipping` et les nouvelles valeurs.
- Après une fusion : `db:deploy` puis `db:check`.

## Alternatives écartées

- **Barème dans le schéma `orders`** (comme le réglage du paiement à la livraison) : plus simple, mais BR-021 et le
  transporteur appartiennent au module `shipping` ; l'inscription garde `orders` indépendant.
- **Statut « à préparer » stocké** : redondant avec les commandes prêtes ; deux sources de vérité.
- **Arrondi au plus proche** : pouvait donner un peu plus de 15 % à Kemdia ; refusé par le propriétaire.
- **Attendre le transporteur** : aurait bloqué tout le suivi des livraisons ; le port neutre ne coûte rien.
