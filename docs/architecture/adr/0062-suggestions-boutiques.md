# ADR-0062 — Recherche : boutiques dans les suggestions pendant la frappe

- **Statut** : Accepté
- **Date** : 2026-10-27
- **Tâche** : S8-T05 (dette S7.5)
- **Complète** : [ADR-0053](0053-recherche-suggestions-fautes.md) (suggestions et correction des fautes),
  [ADR-0054](0054-boutiques-publiques-quartier.md) (pages publiques des boutiques)

## Contexte

Depuis S7.5, le champ de recherche propose pendant la frappe des produits, des rayons et des marques, et chaque
boutique active a sa page publique (`/boutique/<adresse>`). Un client qui tape le nom d'une boutique ne la trouvait pas :
il devait passer par l'annuaire.

## Décision

1. La réponse `GET /api/v1/products/suggestions` gagne une liste **`shops`** : **2 boutiques au plus**, avec seulement
   l'adresse, le nom, la ville et « boutique officielle » (jamais l'identifiant interne, le téléphone ni le
   propriétaire). Contrat **2.8.0** (champ ajouté, version mineure).
2. Seules les boutiques **actives** (validées, non suspendues) de la copie du catalogue (`catalog.sellers`) sortent ;
   le catalogue ne lit toujours pas les tables du module vendors.
3. Correspondance : **chaque mot tapé** doit figurer dans le nom, sans accents, majuscules ni ponctuation (comme
   `searchable`) ; le dernier mot peut être incomplet (« eleg » trouve « Élégance »). Boutique officielle d'abord, puis
   par nom.
4. Les boutiques sont cherchées sur les mots **tapés**, pas sur les mots corrigés : la correction des fautes remplace
   les mots par ceux des fiches, et le nom d'une boutique qu'aucun produit ne contient serait « corrigé » en un mot de
   produit. Les mots corrigés ne servent que si les mots tapés ne trouvent aucune boutique.
5. Comparaison faite **dans la requête SQL** (`translate`, `lower`, `regexp_replace`, `LIKE`), sans nouvelle colonne
   ni migration : la table des boutiques est courte (une ligne par boutique validée).
6. Site : ligne « boutique » (icône de boutique, nom, ville) entre les marques et les produits, vers
   `/boutique/<adresse>` construite par le site (adresse refusée si elle n'est pas en `[a-z0-9-]`). Une réponse sans
   `shops` (API plus ancienne) donne zéro boutique, jamais un refus de toute la réponse.

Choix du 2026-10-27 : options recommandées retenues sans être reposées (ta demande du 2026-10-23).

## Conséquences

- Un client trouve une boutique en tapant son nom, en une frappe, sans passer par l'annuaire.
- Une ou deux requêtes SQL de plus par suggestion (la seconde seulement si une correction a eu lieu et que les mots
  tapés ne trouvent rien), sur une table courte ; la limite de 20 suggestions par minute et par adresse reste la même.
- Jusqu'à 10 lignes de suggestions au lieu de 8.

### Risques acceptés

- Lecture complète de `catalog.sellers` à chaque suggestion (pas d'index utilisable par `LIKE '%…%'`) : sans effet tant
  que les boutiques se comptent en centaines. Au-delà de quelques milliers, ajouter une colonne de recherche et un
  index trigrammes (comme `listings.search_text`).
- Les lettres accentuées hors de la liste latine courante (français, langues du Gabon écrites en latin) deviennent une
  espace, comme dans `searchable` ; un nom écrit dans un autre alphabet ne serait pas trouvé.

## Alternatives écartées

- **Colonne `search_name` tenue par l'application** : demande une migration, et les boutiques insérées par SQL (jeux
  de données des tests de bout en bout) n'auraient pas la colonne remplie.
- **Colonne générée par PostgreSQL** : le contrôle `db:check` de Prisma ne sait pas comparer une colonne générée.
- **Liste des boutiques gardée en mémoire** : irait contre S8-T07 (caches en mémoire déplacés avant plusieurs
  instances).
- **Boutiques cherchées sur les mots corrigés seulement** : le nom d'une boutique serait souvent « corrigé » en un mot
  de produit.
