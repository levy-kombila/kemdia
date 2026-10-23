# ADR-0056 — Avis des clients et leur modération

- **Statut** : Accepté
- **Date** : 2026-10-23
- **Tâche** : S8-T01 (FR-020, reporté du S6 « quand les avis existeront »)
- **Complète** : [ADR-0006](0006-monolithe-modulaire-7-modules.md) (nouveau module `reviews`),
  [ADR-0049](0049-fiches-communes-offres.md) (les avis portent sur la fiche commune),
  [ADR-0047](0047-donnees-personnelles-apdpvp.md) (copie et effacement)

## Contexte

Les notes et nombres d'avis affichés venaient du catalogue de démonstration : aucun client ne pouvait donner son avis.
FR-020 (modération des avis) attendait que les avis existent.

Choix du 2026-10-23 : options recommandées retenues sans être reposées (demande du propriétaire), listées ici :

| Question                 | Choix retenu (recommandé)                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------ |
| Qui peut donner son avis | **Un client dont une commande contenant ce produit est livrée** (« Achat vérifié »)                    |
| Combien                  | **Un avis par compte et par fiche**, modifiable et retirable                                           |
| Modération               | **Note seule publiée tout de suite** ; **commentaire relu** par l'équipe Catalogue avant d'être publié |
| Nom affiché              | **Prénom et initiale du nom** (« Awa N. »), jamais le nom complet ni la photo (privée)                 |
| Note de la fiche         | **Tirée des seuls avis publiés** (les données de démonstration restent tant qu'aucun avis réel)        |
| Effacement du compte     | **Ses avis sont effacés** et la note des fiches recalculée                                             |

## Décision

1. **Module `reviews`** (schéma PostgreSQL `reviews`, migration `20261023200000_avis_clients`) : table `reviews.reviews`
   (note 1–5, commentaire facultatif 10–1 000 caractères, nom affiché figé, état `PENDING` / `PUBLISHED` / `REJECTED`,
   motif d'un refus) ; un avis par `(fiche, compte)` ; contraintes de la base qui doublent le domaine (une note seule
   n'est jamais « en attente », un refus a toujours un motif).
2. **Achat vérifié** : le module lit, par leurs ports publics, la fiche publiée et ses offres (`catalog` :
   `ListingRatings`) et les commandes **livrées** du compte (`orders` : `OrdersPurchases`) ; jamais leurs tables.
3. **États** : écrire ou modifier un avis sans commentaire le publie ; avec un commentaire, il attend l'équipe
   (`POST /admin/reviews/{id}/publish` ou `/reject` avec un motif), rôle Catalogue et double authentification, tracé au
   journal (`review.published`, `review.rejected`). Modifier un avis refusé ou publié le soumet de nouveau.
4. **Note de la fiche** (`listings.rating`, `listings.review_count`) recalculée à partir des avis publiés dans la
   **même transaction** que chaque changement (écriture, retrait, décision, effacement du compte).
5. **Routes** : `GET /products/{slug}/reviews` (public, 10 par page, cache 60 s), `GET/PUT/DELETE
/products/{slug}/reviews/mine` (session ; 10 écritures par minute), `GET /admin/reviews` (file, du plus ancien).
   Contrat **2.5.0**.
6. **Site** : section « Avis clients » de la fiche (moyenne, répartition, avis avec « Achat vérifié », pages), formulaire
   pour le client livré (étoiles au clavier, commentaire facultatif, état et motif d'un refus), page de l'équipe
   `/equipe/avis`.
7. **Données personnelles** : avis dans la copie (`avis`), effacés avec le compte.

## Conséquences

- Les notes deviennent réelles au fil des avis ; les fiches de démonstration gardent leurs notes tant qu'aucun avis réel
  ne les remplace.
- L'équipe Catalogue a une file de plus ; une note seule n'y passe jamais.
- Pas encore de réponse du vendeur, de signalement par les clients, ni de photos dans les avis.

## Alternatives écartées

- **Tout publier puis modérer après coup** : un commentaire injurieux ou une donnée personnelle serait visible avant
  la relecture.
- **Tout relire, même les notes seules** : charge inutile pour l'équipe, rien à lire dans une note.
- **Avis ouverts à tous les comptes** : faux avis faciles ; l'achat livré est la meilleure garantie disponible.
- **Avis dans le module `catalog`** : il aurait dû lire les commandes (module `orders`), qui dépend déjà de lui.
