# ADR-0054 — Boutiques publiques, quartier et « boutiques près de chez moi »

- **Statut** : Accepté
- **Date** : 2026-10-23
- **Tâche** : S7.5-T07
- **Complète** : [ADR-0032](0032-boutiques-vendeurs.md) (boutiques des vendeurs),
  [ADR-0049](0049-fiches-communes-offres.md) (copie des boutiques dans le catalogue),
  [ADR-0024](0024-commandes-reservation-stock.md) (villes et quartiers de la livraison)

## Contexte

Une boutique n'avait pas de page publique : son nom apparaissait à côté de ses offres, sans lien. Sa ville était un
texte libre, sans quartier, et le vendeur ne pouvait plus rien changer après sa demande. Le catalogue ne connaissait
d'une boutique que son nom, son adresse et sa ville (copie `catalog.sellers`, tenue par le module vendors).

Choix du propriétaire (2026-10-23) :

| Question                          | Choix                                                                                   |
| --------------------------------- | --------------------------------------------------------------------------------------- |
| Ville et quartier                 | **Listes officielles de la livraison** (13 villes, leurs quartiers, « Autre quartier ») |
| « Près de chez moi » (pas de GPS) | **Même ville, mon quartier d'abord**                                                    |
| Page publique                     | **Infos + produits, sans téléphone** (les achats passent par Kemdia)                    |
| Accès                             | **Page `/boutiques`** et **lien depuis la fiche produit** (options recommandées)        |
| « Ma boutique »                   | **Ville, quartier, description** sans nouvel examen ; **le nom reste fixé**             |
| Boutique Kemdia                   | **Dans l'annuaire, comme « Boutique officielle »**, en tête                             |

## Décision

1. **Données** (migration `20261023120000_boutiques_quartier`) :
   - `vendors.shops.neighborhood` (vide = « Autre quartier » ou pas encore choisi) ;
   - les villes déjà saisies qui correspondent à une ville officielle (casse et accents ignorés) prennent son nom
     exact ; les autres restent telles quelles jusqu'à ce que le vendeur choisisse dans la liste ;
   - la copie publique `catalog.sellers` reçoit quartier, description, `official`, `active` (validée et non
     suspendue) et `since` (première validation) ; index unique sur l'adresse, index `(active, city)`.
2. **Ville et quartier vérifiés par l'application** (`shop-place.ts`) contre les listes de `@kemdia/contracts/delivery`
   (le domaine ne dépend pas du contrat) : à la demande d'ouverture et dans « Ma boutique ».
3. **« Ma boutique »** : `PATCH /vendors/shop` (session, 10 par minute et par compte) change ville, quartier et
   description, sans nouvel examen ; jamais le nom, l'adresse, le téléphone ni le statut (corps strict). Impossible
   pour une boutique refusée (elle refait une demande) et pour la boutique Kemdia. Une boutique validée (active ou
   suspendue) met aussitôt à jour sa copie publique. Journal : `shop.profile_updated` (ville, quartier, ancienne
   ville, description changée ou non).
4. **Copie publique tenue par vendors** à chaque décision (validation, suspension, réactivation) et à chaque
   modification ; `since` n'est écrit qu'à la création de la copie (une réactivation ne le remet pas à zéro).
5. **Routes publiques** (module catalog, lues dans la copie, jamais dans les tables de vendors) :
   - `GET /shops?ville=&quartier=&page=` : boutiques **actives**, 24 par page, la boutique officielle d'abord, puis
     celles du quartier du client, puis par nom ; avec le nombre de produits visibles ;
   - `GET /shops/{slug}` : boutique active, sinon 404 ; ni téléphone, ni propriétaire, ni identifiant interne ;
   - `GET /products?shop={slug}` : les fiches où la boutique a une offre visible, avec **son** prix et **son** stock
     (« en stock » se lit aussi sur son offre) ; boutique inconnue ou pas active : liste vide.
6. **Site** : `/boutiques` (formulaire GET sans JavaScript : ville, puis quartier ; ville par défaut = cookie
   `kemdia_ville`), `/boutique/{slug}` (infos puis produits avec tri, filtres et pages comme une catégorie),
   `/vendeur/boutique` (« Ma boutique »), listes déroulantes de ville et de quartier dans la demande d'ouverture,
   nom du vendeur cliquable sur la fiche produit et dans « Autres vendeurs », `/boutiques` dans le plan du site.
7. **Contrat 2.3.0** : routes `/shops`, `/shops/{slug}`, `PATCH /vendors/shop`, paramètre `shop`, schémas
   `PublicShop`, `PublicShopPage`, `ShopProfileRequest`, `neighborhood` dans `Shop` et la demande d'ouverture.

## Conséquences

- Un client voit les boutiques de sa ville, celles de son quartier en premier, et peut parcourir les produits d'une
  boutique avec ses prix.
- Le vendeur corrige seul sa ville, son quartier et sa description ; le nom reste sous le contrôle de l'équipe.
- Une ville hors liste (ancienne saisie libre) reste affichée telle quelle jusqu'à la prochaine modification du
  vendeur ; elle n'apparaît pas quand on filtre par une ville officielle.
- Le site garde les réponses 60 s : une boutique suspendue peut rester visible jusqu'à une minute (ses produits, eux,
  disparaissent des listes dès la suspension).
- Nouvelle migration : `db:deploy` puis `db:check` après la fusion.

## Alternatives écartées

- **Quartier en texte libre** : orthographes différentes, « près de chez moi » moins fiable.
- **Distance GPS** : prévue après la bêta (planning).
- **Téléphone public** : les achats pourraient se faire hors de Kemdia (pas de protection du client ni de commission).
- **Nom modifiable par le vendeur** : une boutique pourrait changer d'identité aux yeux des clients ou imiter une
  autre ; le nom reste sous le contrôle de l'équipe.
- **Lire les tables de vendors depuis le catalogue** : contraire au découpage en modules ([ADR-0006](0006-monolithe-modulaire-7-modules.md)) ; la copie publique
  suffit.
