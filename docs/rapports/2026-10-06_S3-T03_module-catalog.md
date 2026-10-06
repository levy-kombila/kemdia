# Rapport — Module catalogue

|                                                 |                                                   |
| ----------------------------------------------- | ------------------------------------------------- |
| **Date**                                        | 2026-10-06                                        |
| **Sprint / tâches**                             | S3 — S3-T03                                       |
| **Version**                                     | v0.3.0 (en cours)                                 |
| **Sections du cahier d'architecture modifiées** | §2.1 (F3), §3.2, §3.6 (nouvelle), §6.3, §9 (v1.3) |

## 1. Résumé

Le premier module métier de l'API existe : **`catalog`**. Il range dans PostgreSQL les catégories, les produits
et leurs **variantes**, chacune avec son prix et **son propre stock** (FR-013). Il sait répondre à tout ce que le site
demande aujourd'hui à son fichier de démonstration : arborescence, fiche produit, recherche, filtres, tri, pagination, compteurs.
Il applique la règle **BR-001** : on ne commande pas un produit indisponible ou sans stock.

Le catalogue de démonstration (112 catégories, 50 produits) s'importe avec une commande.
Les routes HTTP arrivent au **S3-T04**, et le site s'y branchera au **S3-T05**.

## 2. Fonctionnalités livrées

| Élément                 | Ce que ça fait, en simple                                                                                                                                | Fichiers principaux                                          |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Domaine (règles pures)  | Un produit invalide **ne peut pas exister** : prix FCFA entiers et positifs, prix barré > prix, stock ≥ 0, UUID, images internes                         | `domain/product.ts`, `domain/values.ts`                      |
| Variantes               | Chaque produit a au moins une variante (« Noir », « Bleu · M »…) avec son prix et son stock ; le prix affiché est le plus bas                            | `domain/product.ts`                                          |
| BR-001                  | « Puis-je commander 3 exemplaires de cette variante ? » → oui, indisponible, variante inconnue, ou stock insuffisant (reste : 2)                         | `Product.checkOrderable`, `CatalogService.checkAvailability` |
| Arborescence            | Parents existants, pas de boucle, 3 niveaux au plus (BR-005, aussi vérifié par la base) ; une catégorie montre aussi les produits de ses sous-catégories | `domain/category.ts`                                         |
| Lecture du catalogue    | Fiche produit, recherche sans accents, 5 tris, filtres (prix, marques, stock, promotion, note), compteurs des filtres                                    | `application/catalog.service.ts`                             |
| Recherche protégée      | Valeurs farfelues ignorées, mots réduits à lettres et chiffres, pages de 48 au plus                                                                      | `application/product-search.ts`                              |
| Base de données         | 3 tables dans le schéma `catalog`, et des **règles posées dans la base elle-même** (prix, stock, suppression de catégorie)                               | `prisma/schema/catalog.prisma`, migration `catalogue`        |
| Import de démonstration | `pnpm --filter @kemdia/api db:seed` : relançable sans doublon, refusé en production                                                                      | `infrastructure/demo-catalog.ts`, `prisma/seed.ts`           |

## 3. Décisions techniques

[ADR-0009](../architecture/adr/0009-modele-catalogue.md) — en résumé :

- **Tout produit a au moins une variante.** Un produit « simple » en a une seule : il n'y a qu'un cas à gérer.
- **Le stock est sur la variante**, jamais recopié sur le produit (il changera à chaque commande).
  Le **prix**, lui, est recopié (le plus bas des variantes actives) pour trier et filtrer vite.
- **Une variante retirée est désactivée, jamais supprimée** : elle peut figurer dans une commande (BR-002).
- **Identifiants de démonstration stables** : ils sont calculés à partir de l'adresse du produit (UUID v5).
  La démo et le staging auront donc les mêmes identifiants, et relancer l'import ne crée pas de doublon.

## 3 bis. Décision : 3 niveaux de catégories (BR-005)

Réponse de l'équipe à la question 8 : **3 niveaux au plus**.

- **Données** : le rayon était mal classé (« Mode › Sport › Fitness › Yoga »). « Fitness » et ses 4 sous-catégories
  (Musculation, Yoga, Cardio, Accessoires fitness — 7 produits) sont déplacés sous **« Sport & Loisirs »**,
  dans les données de l'API et dans celles du site. Les **adresses ne changent pas** (`/categorie/sport-fitness`, `/categorie/fitness-yoga`…) :
  les liens déjà partagés fonctionnent toujours, et les identifiants de démonstration restent les mêmes.
- **Domaine** : `MAX_CATEGORY_DEPTH = 3` ; l'ancien classement est désormais refusé (testé).
- **Base** : une contrainte `CHECK` ne voit qu'une ligne, alors qu'il faut regarder les parents. Un **déclencheur** (`categories_depth_check`)
  vérifie, à chaque création ou déplacement de catégorie, que la catégorie **et ses sous-catégories** restent dans 3 niveaux,
  et refuse les boucles (une catégorie placée sous sa propre sous-catégorie). Un verrou empêche deux déplacements simultanés
  de contourner la règle à eux deux.

```
Avant : Mode › Sport › Fitness › Yoga            (4 niveaux)
Après : Sport & Loisirs › Fitness › Yoga         (3 niveaux)
```

## 4. Sécurité

| Mesure                                                                                                                    | Risque couvert                         |
| ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Contraintes SQL : prix > 0, prix barré > prix, stock ≥ 0, 3 niveaux de catégories (vérifié en essayant de les enfreindre) | Montants ou stocks incohérents         |
| Recherche : seulement lettres et chiffres transmis à la base ; 8 mots, 48 produits par page au plus                       | Injection, joker SQL, surcharge        |
| Images : chemins `/images/…` uniquement                                                                                   | HIGH-03 de l'ancien audit (SSRF)       |
| Brouillons et produits archivés invisibles et non commandables                                                            | Fuite d'un produit non validé          |
| Tests d'intégration refusés hors d'une base `*_test`                                                                      | Effacement de la base de développement |

## 5. Qualité

- **95 tests unitaires** de l'API (+46) : règles des produits et variantes, BR-001 dans tous ses cas, arborescence,
  validation des recherches, service du catalogue, import de démonstration (les 162 lignes passent les règles du domaine).
- **27 tests d'intégration** sur un vrai PostgreSQL (+21), dont 4 sur la limite de 3 niveaux appliquée par la base.
  **Les résultats attendus sont recalculés avec la logique actuelle du site**, à partir des mêmes données :
  pour 5 catégories, 6 recherches, chaque filtre et les compteurs, l'API renvoie **exactement les mêmes produits que le site**.
  Le passage au S3-T05 ne changera donc rien pour les clients.
- La migration écrite à la main (même raison qu'au S3-T02) est contrôlée par la CI (`db:check`).
- Site : 120 tests, inchangés.

## 6. Captures d'écran

Sans objet (aucune interface).

## 7. Limites connues / dette technique

- Contrôle de profondeur en base : la règle est vérifiée par un déclencheur qui sérialise les modifications
  de l'arborescence (verrou). Sans effet pour un catalogue de cette taille, où les déplacements de rayons sont rares.
- La recherche lit toute la table des produits : très bien pour ~500 produits, à indexer au-delà.
- Au S3-T05, les identifiants des produits passeront de `"38"` à des UUID : les paniers et favoris déjà enregistrés
  dans les navigateurs de la démo seront vidés (ils sont revalidés au chargement, sans erreur).
- Le fichier de démonstration existe en deux exemplaires (site et API) jusqu'au S3-T05.

## 8. Prochaines étapes

**S3-T04** : routes REST `/api/v1` (catégories, produits, recherche, disponibilité), documentation OpenAPI, limitation de débit.

## Comment essayer (Docker Desktop requis)

```bash
docker compose up -d db
pnpm install
pnpm --filter @kemdia/api db:deploy
pnpm --filter @kemdia/api db:seed     # « Catalogue de démonstration importé : 112 catégories, 50 produits. »
```
