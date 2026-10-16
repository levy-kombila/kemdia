# ADR-0033 — Produits des vendeurs et modération

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Tâche** : S6-T02
- **Complète** : [ADR-0032](0032-boutiques-vendeurs.md) (boutiques), [ADR-0009](0009-modele-catalogue.md) (catalogue), [ADR-0024](0024-commandes-reservation-stock.md) (réservation du stock)

## Contexte

Depuis le S6-T01, un vendeur a une boutique validée mais ne peut rien vendre. BR-003 impose que tout produit d'un vendeur tiers
soit **validé par la modération avant d'être visible** (FR-002). Les produits appartiennent au module `catalog` ; les droits
(vendeur, boutique active, modérateur) au module `vendors`.

Choix du propriétaire (2026-10-16) :

| Question                  | Choix                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Sujet du S6-T02           | **Produits des vendeurs + modération** (KYC, double authentification et site plus tard)                            |
| Qui modère                | **Modérateur ou administrateur** (le rôle `moderator` du S4-T06 ; un administrateur en a les droits)               |
| Modification d'un produit | **Prix et stock libres** ; titre, description, marque, catégorie → **nouvelle modération**, produit caché d'ici là |
| Photos                    | **Tâche suivante** : en attendant, le site affiche son image neutre (déjà prévue)                                  |
| Site                      | **API seule**                                                                                                      |

## Décision

| Sujet              | Choix                                                                                                                                                                                                                                   | Raison                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Où                 | Le catalogue garde les produits et leurs états (`VendorCatalog`, port public, sans aucun droit) ; le module `vendors` décide des droits, écrit le journal et porte les routes (`/vendors/products`, `/moderation/products`)             | Le catalogue ne dépend pas des vendeurs ; un seul endroit pour les droits           |
| Statuts            | `PENDING` (en modération) et `REJECTED` (refusé, motif) ajoutés à `DRAFT`, `PUBLISHED`, `ARCHIVED` ; migration à part pour les valeurs d'énumération                                                                                    | PostgreSQL n'emploie pas une valeur ajoutée dans la même transaction                |
| Visibilité         | **Une règle** : `PUBLISHED` ET boutique non suspendue (`Product.isVisible`), appliquée à la fiche, aux listes et filtres, au panier, à la disponibilité et à la réservation du stock                                                    | Rien d'invisible ne s'affiche ni ne se vend                                         |
| Boutique suspendue | Colonne `catalog.products.shop_suspended`, mise à jour dans la transaction de la suspension (S6-T01) ; remise à faux à la réactivation                                                                                                  | Les produits gardent leur statut et reviennent tels quels                           |
| Droits du vendeur  | Rôle `vendor` (route) ET boutique **active** relue sous **verrou partagé** dans la transaction ; produit d'une autre boutique = introuvable (404)                                                                                       | Une suspension attend la fin de l'écriture ; pas de fuite d'existence               |
| Modération         | `moderator` ou `admin`, connexion < 15 min ; seulement un produit en attente ; **jamais un produit de sa propre boutique** ; la décision porte le `submittedAt` **lu** par le modérateur, refusée (`PRODUIT_MODIFIE`) s'il a changé     | On ne valide jamais un contenu que le modérateur n'a pas vu (relecture de sécurité) |
| Modifications      | Titre, description, marque, catégorie → `PENDING` (caché) ; prix, prix barré, stock, activation d'une variante → sans modération, **tracés** ; archivage (jamais de suppression, BR-002) ; remise en vente → `PENDING`                  | Choix du propriétaire ; preuve en cas de litige sur un prix                         |
| Stock              | Quantité disponible (hors commandes en cours) ; changée seulement avec `previousStock` égal au stock lu **sous verrou**, sinon `STOCK_MODIFIE`                                                                                          | Une réservation de commande n'est jamais écrasée                                    |
| Verrous            | Vendeur : boutique (partagé) → produit → variantes (ordre des identifiants) ; suspension : boutique → produits (ordre des identifiants) ; réservation : produits (partagé, ordre des identifiants) → variantes (ordre des identifiants) | Pas d'interblocage ; un produit caché à l'instant n'est jamais réservé              |
| Saisie             | Textes nettoyés (invisibles, contrôles, remplissages hangûl et braille), au moins une lettre ou un chiffre, longueurs en caractères ; 20 variantes ; caractéristiques sans doublon ; références `V…-n` et adresse lisible générées      | Pas de texte caché pour tromper la modération                                       |
| File de modération | 50 produits en attente au plus par boutique (`TROP_DE_PRODUITS_EN_ATTENTE`)                                                                                                                                                             | La file ne s'inonde pas                                                             |
| Panier             | Produit devenu invisible : « Produit indisponible », sans photo                                                                                                                                                                         | Un titre non modéré n'atteint pas les clients                                       |
| Journal            | `product.submitted` (création, modification, remise en vente), `product.approved`, `product.rejected` (motif), `product.archived`, `product.variant_updated` (avant / après)                                                            | Historique complet sans relation entre modules                                      |
| Base de données    | Contraintes : motif ⇔ refusé ; en attente ⇒ date de demande ; modérateur et date ensemble ; produits Kemdia jamais en modération, jamais examinés, jamais cachés                                                                        | Même un bogue ne peut pas écrire un état incohérent                                 |
| Contrat            | 1.15.0 : `VendorProduct*`, `VendorVariant*`, `Moderation*`, `ProductApproval`, `ProductModerationReason` ; `VENDOR_PRODUCT_*`, `MAX_PENDING_PRODUCTS_PER_SHOP` ; cible `product` au journal                                             | Le site (tâche suivante) branchera l'espace vendeur et la file de modération        |

## Options écartées

- **Garder l'ancienne version en ligne pendant la modération** : plus confortable pour le vendeur, mais deux versions par produit ; écarté par le propriétaire.
- **Revalider aussi les changements de prix et de stock** : sûr, mais bloque la vente pour une simple mise à jour de stock ; écarté.
- **Mettre les routes de modération dans le catalogue** : il faudrait que le catalogue connaisse les propriétaires de boutique (règle « pas sur soi »), donc dépende de `vendors`.
- **Stock modifié en écrasant la valeur** : une commande passée entre la lecture et l'écriture du vendeur serait perdue (survente).

## Conséquences

- ➕ Un vendeur peut vendre ; rien n'est visible avant validation ; une boutique suspendue disparaît du site en une opération.
- ➕ Le stock reste juste même quand vendeur et clients agissent en même temps.
- ➖ La version précédente de l'API ne connaît pas les nouveaux statuts : ses instances doivent être arrêtées avant d'ouvrir les routes des vendeurs (une seule instance sur Render : sans effet aujourd'hui).
- ➖ Le catalogue public peut rester en cache jusqu'à 6 minutes (`max-age=60`, `stale-while-revalidate=300`) : un produit tout juste caché reste servi un moment par un cache intermédiaire (contenu déjà modéré).
- ➖ Pas de photos, ni de changement des noms et caractéristiques des variantes après création : tâches suivantes.
- ➖ Plafond de 50 produits en attente : limite souple (deux envois simultanés du même vendeur peuvent le dépasser d'une unité).
