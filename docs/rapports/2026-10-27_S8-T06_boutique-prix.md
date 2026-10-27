# Rapport — S8-T06 : page d'une boutique, filtre et tri par le prix de SON offre

|                                                 |                                                          |
| ----------------------------------------------- | -------------------------------------------------------- |
| **Date**                                        | 2026-10-27                                               |
| **Sprint / tâches**                             | S8 — S8-T06 (dette S7.5-T07)                             |
| **Version**                                     | v0.8.1 → (v0.9.x à la clôture du S8) ; contrat **2.7.1** |
| **Sections du cahier d'architecture modifiées** | §3.37 (nouvelle) — version 4.33                          |

## 1. Résumé

Sur la page d'une boutique, chaque carte montrait le prix de **cette** boutique, mais le tri et les filtres de prix
utilisaient le prix le plus bas de **toutes** les boutiques qui vendent le produit. Exemple :

```
Fiche « Smartphone » : boutique A 300 000, boutique B 500 000  → prix de la fiche : 300 000
Page de la boutique B, « Prix maximum 300 000 » :
  avant : le smartphone apparaît (300 000), sa carte affiche 500 000
  après : il n'apparaît pas ; trié par prix, il se range à 500 000
```

## 2. Fonctionnalités livrées

| Élément   | Ce qui change sur la page d'une boutique                                                                       | Où                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Filtres   | Prix minimum et maximum, « en promotion » : lus sur l'offre de la boutique                                     | `prisma-product.repository.ts` (`whereOf`)                 |
| Compteurs | Tranches de prix et « en promotion » : comptées sur l'offre de la boutique                                     | `prisma-product.repository.ts` (`facets`, `onOffer`)       |
| Tri       | « Prix croissant » / « décroissant » : fiches choisies et ordonnées sur les offres de la boutique              | `prisma-product.repository.ts` (`search`)                  |
| Contrat   | Paramètre `shop` documenté ; contrat **2.7.1** (aucun champ ne change)                                         | `packages/contracts/src/query.ts`, `docs/api/openapi.json` |
| Tests     | 1 test d'intégration : tri dans les deux sens, pages, filtres, promotion, compteurs, hors boutique, suspension | `apps/api/test/listings.int.test.ts`                       |

Aucun changement du site (la page d'une boutique utilisait déjà ces paramètres) ni de la base.

## 3. Décisions techniques

Choix du 2026-10-27 : options recommandées retenues sans t'être reposées.

- conditions de prix et de promotion déplacées sur **l'offre de la boutique** (une au plus par fiche : pas de doublon) ;
- tri par prix fait sur la **table des offres** (index `shop_id`), seulement pour la page d'une boutique ;
- même règle de prix que le reste du catalogue : **déclinaison active la moins chère** de l'offre ;
- rien ne change hors page de boutique ; **aucune migration**.

Le test a été lancé sur l'ancien code : il échoue bien (tri dans le mauvais ordre), puis passe avec la correction.

Décision complète : [ADR-0063](../architecture/adr/0063-boutique-prix-offre.md).

## 4. Sécurité

### Relecture indépendante (agent séparé, avant la PR) : 0 critique, 0 haute, 1 moyenne, 3 basses, 1 info

| Problème relevé                                                                                                    | Correction                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Moyenne : le filtre lit le prix de la déclinaison active la moins chère, la carte celui de la moins chère en stock | **Accepté** (ADR) : même règle que le prix « à partir de » de tout le catalogue ; à changer pour tout le catalogue à part |
| Basse : la 2e requête du tri ne reprenait pas les conditions de la liste (fiche dépubliée entre deux requêtes)     | Conditions de la liste ajoutées à la 2e requête                                                                           |
| Basse : une offre sans déclinaison active comptait dans le total sans carte                                        | Au moins une déclinaison active exigée sur la page d'une boutique                                                         |
| Basse : test incomplet (promotion, suspension avec tri, contrôle hors boutique trop faible)                        | Cas ajoutés ; contrôle hors boutique fait sur la fiche elle-même (présente, puis filtrée)                                 |
| Info : pagination par décalage sur l'ordre des prix                                                                | **Accepté** (ADR) ; index `(shop_id, status, price)` si une boutique dépasse quelques milliers de produits                |

Sans problème selon la relecture : offres non publiées, boutiques suspendues et fiches fusionnées jamais montrées ;
total et liste sur le même ensemble, sans doublon ; page au-delà de la dernière ramenée à la dernière ; aucune requête
SQL écrite à la main (tout passe par Prisma) ; aucun changement hors page de boutique.

## 5. Qualité

- Format et lint sur tout le dépôt, typecheck et build : ✓.
- Tests unitaires : API **657** ✓, site **501** ✓, contrat **34** ✓.
- Intégration sur une base PostgreSQL neuve : **257** ✓ (+1).
- `pnpm audit --audit-level high --prod` : aucune faille haute ou critique (1 moyenne, sous le seuil) ; Gitleaks
  v8.30.1 ✓ ; bout en bout, performance, Semgrep, CodeQL et ZAP : par la CI.

## 6. Captures d'écran

Visible sur la démo après le déploiement : page d'une boutique, « Prix croissant » ou un filtre de prix.

## 7. Limites connues / dette technique

- Quand la déclinaison la moins chère d'une offre est en rupture, la carte peut montrer un prix plus élevé que celui
  du filtre (règle commune à tout le catalogue).

## 8. Prochaines étapes

- Aucune migration. Après la fusion, attendre « Déploiement DÉMO (Render) ».
- Suite : S8-T07 (caches et compteurs en mémoire de l'API déplacés en base).
