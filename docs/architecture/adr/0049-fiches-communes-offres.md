# ADR-0049 — Fiche commune et offres des boutiques (modèle Amazon/Jumia)

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Tâche** : S7.5-T02 (API et données ; les écrans viennent au S7.5-T03)
- **Complète** : [ADR-0033](0033-produits-vendeurs-moderation.md) (produits des vendeurs), [ADR-0035](0035-photos-produits-vendeurs.md)
  (photos), [ADR-0038](0038-commandes-vendeurs.md) (commandes des vendeurs)

## Contexte

Jusqu'au S7, chaque vendeur créait **son** produit : titre, photos, variantes, prix et stock. Deux boutiques qui
vendent un iPhone 15 créaient donc deux fiches, avec deux noms différents. Les remarques du propriétaire (2026-10-19)
décrivaient trois problèmes :

- des doublons et des noms différents pour un même produit ;
- un client qui veut deux iPhone 15 chez deux vendeurs ayant un seul exemplaire chacun ;
- l'envie de choisir une boutique proche de chez soi.

Les grandes places de marché (Amazon, Jumia) séparent la **fiche** (ce qu'est le produit) des **offres** (qui le vend,
à quel prix, avec quel stock). Le propriétaire a choisi ce modèle **avant la bêta**, tant que le catalogue est petit.

Choix du propriétaire (2026-10-20) :

| Question                          | Choix                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| Découpage                         | **Fiche + offres en 2 PR** : API et données (S7.5-T02), puis écrans (S7.5-T03)            |
| Qui crée, qui corrige une fiche   | **Le vendeur crée** la fiche (modérée) ; une fois en ligne, **seule l'équipe** la corrige |
| Offre mise en avant               | **En stock d'abord, puis la moins chère, puis la plus proche** (ville du client)          |
| États d'une offre                 | **Neuf seulement** pour la bêta                                                           |
| Offre sur une fiche déjà en ligne | **Publiée tout de suite** (ni texte ni photo à modérer ; l'équipe peut la retirer)        |

## Décision

1. **Deux niveaux dans la base (schéma `catalog`).**
   - `listings` (la **fiche**) : titre, description, marque, catégorie, photos, statut, boutique qui l'a créée.
   - `listing_variants` : les déclinaisons communes (« Noir · 128 Go »).
   - `products` devient l'**offre** d'une boutique : statut, prix, stock par variante. Chaque variante d'offre désigne
     une déclinaison de la fiche (`listing_variant_id`).
   - Une boutique a au plus une offre par fiche (contrainte d'unicité).
2. **Reprise sans rupture.** Chaque produit existant devient une offre sur **sa** fiche, qui reprend **son identifiant
   et son adresse**, et chaque variante sa déclinaison. Les liens du site, les paniers et les commandes ne changent pas :
   ils désignent toujours les mêmes variantes d'offre. Les doublons existants sont ensuite **fusionnés par l'équipe**.
3. **La base garde la cohérence** (déclencheurs `plpgsql`) :
   - une offre **copie** le contenu de sa fiche, et une variante le nom de sa déclinaison, à chaque écriture. Le panier,
     les commandes et l'espace vendeur, qui lisent l'offre, affichent donc toujours le contenu de la fiche, même si une
     écriture tente autre chose ;
   - une correction de la fiche est recopiée sur toutes ses offres ;
   - le prix « à partir de » et le nombre d'offres visibles de la fiche sont recalculés à chaque changement d'offre ;
   - tant qu'elle n'est pas publiée, la fiche **suit le statut** de l'offre de la boutique qui l'a créée (modération,
     archivage). Une fois en ligne, seule l'équipe change son statut ;
   - une variante ne peut pas désigner la déclinaison d'une autre fiche.
4. **Site public.** Une **carte par fiche** et une page par fiche, avec **toutes les offres visibles**.
   - L'offre **mise en avant** (bouton « Ajouter au panier ») est choisie ainsi : une offre en stock d'abord, puis la
     moins chère, puis, à prix égal, une boutique de la ville du client (`?ville=`, facultatif), puis l'identifiant
     (même réponse à chaque appel).
   - Le contrat 1.24.0 **ajoute** des champs (`offers`, `offerCount`, `listing`, `listingVariantId`) : les champs
     existants gardent leur sens, celui de l'offre mise en avant. Le site actuel fonctionne sans changement, et les
     doublons disparaissent déjà des listes.
   - L'adresse d'un doublon fusionné renvoie la fiche qui le remplace.
5. **Vendeurs.**
   - Chercher une fiche en ligne (`GET /vendors/listings`), puis y poser son offre
     (`POST /vendors/listings/{id}/offer`) : l'offre est **en ligne tout de suite** et inscrite au journal (« offer.created »).
   - Ajouter une déclinaison de la fiche à son offre (`POST /vendors/products/{id}/variants`).
   - Le contenu n'est modifiable que sur une fiche que la boutique a créée et qui **n'est pas encore en ligne** ; sinon,
     `FICHE_PUBLIEE` (409).
   - Sur une fiche en ligne, une offre archivée revient en ligne tout de suite. Une offre **retirée par l'équipe** ne
     s'archive pas et repasse par la modération pour revenir.
6. **Équipe** (modérateurs et administrateurs, double authentification de moins de 15 min) : corriger une fiche
   (contenu, déclinaisons renommées ou ajoutées), retirer une photo, **fusionner** un doublon (correspondance des
   déclinaisons obligatoire, refusée si une boutique vend sur les deux fiches), **retirer** une offre avec un motif.
   Chaque action est inscrite au journal d'audit. Personne n'agit sur une fiche ou une offre de sa propre boutique.
7. **Photos.** Elles appartiennent à la fiche, rangées avec l'offre de la boutique créatrice (même identifiant). Elles
   sont servies tant que la fiche est en ligne avec au moins une offre visible, même si cette boutique ne vend plus.
8. **Boutiques vues du catalogue** (`catalog.sellers` : nom, adresse, ville) : copie tenue par le module `vendors` à
   chaque décision (validation, suspension, réactivation), pour ne jamais lire ses tables.
9. **Réservation de stock** : en plus de l'offre publiée et de la boutique non suspendue, la fiche doit être publiée.

## Conséquences

- **Positives** :
  - Un seul produit à l'écran, plusieurs vendeurs, et le client choisit la boutique (prix, ville).
  - Deux exemplaires chez deux vendeurs = deux lignes dans le même panier, déjà séparées par boutique (S6-T07).
  - Les titres et photos sont **toujours modérés**. Une offre n'apporte que prix et stock ; un vendeur ne peut plus
    changer le titre d'une fiche en ligne pour tromper les clients.
  - Les paniers, commandes, factures et liens existants ne changent pas.
- **Négatives** :
  - Le vendeur créateur ne peut plus corriger seul sa fiche une fois en ligne ; il passe par l'équipe. Les
    **propositions de correction** à l'écran arrivent au S7.5-T03.
  - Les colonnes de contenu restent sur `products` (copie tenue par la base) pour ne pas réécrire tous les modules qui
    les lisent. C'est une dette : les retirer plus tard.
  - Le prix « à partir de » d'une carte (tri, filtres) est le plus bas des offres visibles. Le prix affiché est celui de
    l'offre mise en avant (en stock d'abord), qui peut être un peu plus élevé.
  - Une fiche ne se retire pas en une fois : l'équipe retire ses offres une à une. Un retrait global pourra s'ajouter.
- **Alternatives écartées** :
  - **Relier** les fiches existantes sous une page commune, sans fiche partagée : plus rapide, mais textes et photos en
    double, et fusion à refaire plus tard sur de vraies données.
  - **Modérer chaque offre** : plus lent pour les vendeurs, pour un contenu (prix, stock) que l'équipe peut retirer.
  - **Déplacer le panier et les commandes sur une nouvelle table d'offres** : toute la chaîne de commande aurait été
    réécrite à quelques semaines de la bêta, pour le même résultat.
