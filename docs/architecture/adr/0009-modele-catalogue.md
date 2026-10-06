# ADR-0009 — Modèle du catalogue : variantes, prix « à partir de », recherche sans accents

- **Statut** : Accepté
- **Date** : 2026-10-06
- **Tâche** : S3-T03

## Contexte

Le module `catalog` ([ADR-0006](0006-monolithe-modulaire-7-modules.md)) doit porter les catégories, les produits,
les **variantes avec leur propre stock** (FR-013), des identifiants UUID (BR-042) et la règle BR-001
(pas de commande d'un produit indisponible). Au S3-T05, il remplacera le fichier de démonstration du site :
il doit donc rendre **les mêmes listes** (catégorie avec sous-catégories, recherche sans accents, filtres, tri, compteurs).

## Décision

| Sujet            | Choix                                                                                                                                                                   | Raison                                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Variantes        | Tout produit a **au moins une variante** ; prix, prix barré et **stock** sont portés par la variante                                                                    | Un seul cas à gérer : un produit « simple » est un produit à une variante                                     |
| Caractéristiques | `attributes` en JSON (`{ "couleur": "Noir", "taille": "M" }`), 10 au plus, validées par le domaine                                                                      | Souple pour 50 vendeurs aux produits variés, sans table d'options à maintenir                                 |
| Prix en liste    | Le produit recopie le prix de sa **variante active la moins chère** (`price`, `compare_at_price`), recalculé à chaque enregistrement                                    | Tri et filtre par prix en SQL simple et indexé ; le stock, lui, n'est jamais recopié (il change trop souvent) |
| Statut           | `DRAFT` (préparation, modération BR-003), `PUBLISHED`, `ARCHIVED` (désactivé, BR-002)                                                                                   | Seuls les produits publiés sont listés, affichés ou commandables                                              |
| Suppression      | Une variante retirée est **désactivée**, jamais supprimée                                                                                                               | Elle peut figurer dans une commande (BR-002)                                                                  |
| Recherche        | Colonne `search_text` : titre, marque, catégorie, caractéristiques en minuscules sans accents ; chaque mot doit y figurer                                               | Même résultat que le site ; aucun caractère spécial transmis à la base (pas de joker `%` ou `_`)              |
| Catégories       | Arborescence vérifiée par le domaine (`CategoryTree`) : parents existants, pas de boucle, **4 niveaux** au plus ; gardée 60 s en mémoire                                | 112 lignes qui changent rarement ; « sous-catégories comprises » se calcule sans requête récursive            |
| Règles en base   | Contraintes SQL : prix > 0, prix barré > prix, stock ≥ 0, note entre 0 et 5, catégorie non parente d'elle-même, catégorie non supprimable si elle contient des produits | Défense en profondeur : même un bug ou une requête manuelle ne peut pas créer d'incohérence                   |
| Identifiants     | UUID v4 ; pour la démonstration, **UUID v5 calculés depuis l'adresse** (stables d'un import et d'un environnement à l'autre)                                            | BR-042 ; import relançable sans doublon                                                                       |
| Disponibilité    | `Product.checkOrderable(variante, quantité)` (BR-001), exposé aux autres modules par `CatalogService.checkAvailability`                                                 | Le module `orders` (S5) l'appellera ; la réservation atomique du stock reste BR-012 (S5)                      |

## Options écartées

- **Table des options** (option « Couleur » → valeurs « Noir », « Bleu ») : plus rigoureux, mais lourd pour le MVP ; à revoir si les filtres par taille ou couleur deviennent nécessaires.
- **Recherche plein texte PostgreSQL** (`tsvector`, extension `unaccent`) : plus puissante (pluriels, pertinence), mais résultats différents du site actuel et extension à installer ; à étudier quand le catalogue dépassera quelques milliers de produits (index trigramme ou plein texte).
- **Stock total recopié sur le produit** : se désynchroniserait au premier achat ; on le calcule à partir des variantes.

## Conséquences

- ➕ L'API reproduit les listes du site (vérifié par les tests d'intégration, qui recalculent chaque résultat attendu à partir des données de démonstration).
- ➕ Les règles importantes sont garanties deux fois : par le domaine (tests unitaires) et par la base (contraintes SQL).
- ➖ Le prix recopié sur le produit doit toujours être enregistré par `ProductRepository.save` (jamais par une requête SQL directe).
- ➖ La recherche par `LIKE '%mot%'` lit toute la table : suffisant pour ~500 produits, à indexer au-delà.
