# ADR-0063 — Page d'une boutique : filtre et tri par le prix de SON offre

- **Statut** : Accepté
- **Date** : 2026-10-27
- **Tâche** : S8-T06 (dette S7.5-T07)
- **Complète** : [ADR-0054](0054-boutiques-publiques-quartier.md) (pages publiques des boutiques)

## Contexte

La page d'une boutique (`GET /api/v1/products?shop=<adresse>`) montre chaque produit avec le prix de l'offre de cette
boutique. Mais le filtre par prix, le filtre « en promotion », les compteurs des tranches de prix et le tri par prix
utilisaient le prix « à partir de » de la fiche, c'est-à-dire le moins cher de **toutes** les boutiques. Si une autre
boutique vendait moins cher, la liste était mal triée et mal filtrée (dette notée en S7.5-T07).

## Décision

1. Sur la page d'une boutique, **prix minimum et maximum**, **« en promotion »** et **compteurs des tranches de prix**
   se lisent sur **son offre** (`catalog.products.price` et `compare_at_price`) : une boutique a au plus une offre par
   fiche (`@@unique([listingId, shopId])`), donc chaque fiche est comptée une seule fois.
2. **Tri par prix** sur la page d'une boutique : les fiches de la page sont choisies et ordonnées sur la table des
   offres (prix, puis identifiant de la fiche), puis lues avec les mêmes conditions que la liste. Les autres tris sont
   inchangés.
3. Une offre doit avoir **au moins une déclinaison active** pour être comptée sur la page de sa boutique (sinon la
   fiche entrerait dans le total sans carte).
4. Hors page de boutique (rayons, recherche, promotions), rien ne change.
5. Contrat **2.8.1** (version corrective : aucun champ ne change, la règle des paramètres est précisée).

Choix du 2026-10-27 : options recommandées retenues sans être reposées (ta demande du 2026-10-23).

## Conséquences

- Sur la page d'une boutique, le tri, les filtres et leurs compteurs correspondent aux prix affichés sur ses cartes.
- Une requête de plus (sur la table des offres, servie par l'index `shop_id`) seulement pour la page d'une boutique
  triée par prix. Aucune migration.

### Risques acceptés

- **Même règle que tout le catalogue** (relecture de sécurité, moyenne) : le prix d'une offre est celui de sa
  déclinaison active la moins chère, **en stock ou non** (comme le prix « à partir de » d'une fiche), alors que la carte
  met en avant la déclinaison la moins chère **en stock**. Quand la moins chère est en rupture, la carte peut montrer un
  prix plus élevé que celui qui sert au filtre et au tri. L'écart existe déjà sur les rayons ; le corriger demande de
  changer la règle du prix « à partir de » dans la base, pour tout le catalogue (tâche à part).
- Pagination par décalage sur l'ordre des prix d'une boutique : suffisant tant qu'une boutique a quelques milliers de
  produits ; au-delà, un index `(shop_id, status, price)` (relecture, info).

## Alternatives écartées

- **Copier le prix de chaque boutique sur la fiche** : une colonne par boutique est impossible ; une table de plus
  doublerait `catalog.products`.
- **Tri en mémoire de toutes les fiches de la boutique** : coût proportionnel au nombre de produits à chaque page.
- **Requête SQL écrite à la main** pour toute la liste : perd les conditions partagées de `whereOf` (risque d'écart
  entre la liste et ses compteurs).
