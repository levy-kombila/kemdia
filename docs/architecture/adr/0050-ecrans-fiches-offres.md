# ADR-0050 — Écrans de la fiche commune et propositions de correction

- **Statut** : Accepté
- **Date** : 2026-10-20
- **Tâche** : S7.5-T03 (écrans du modèle « fiche commune + offres »)
- **Complète** : [ADR-0049](0049-fiches-communes-offres.md) (fiche commune et offres, API et données)

## Contexte

Le S7.5-T02 a livré l'API et les données du modèle « une fiche par produit, une offre par boutique ». Le site ne
montrait encore ni les autres vendeurs, ni le parcours « Vendre ce produit », ni les outils de l'équipe. Une fois la
fiche en ligne, le vendeur ne peut plus la modifier. Il lui faut donc un moyen de signaler une erreur à l'équipe.

Choix du propriétaire (2026-10-20) :

| Question                              | Choix                                                                                              |
| ------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Autres offres sur la page produit     | **Bloc « Autres vendeurs »** sous l'offre affichée (boutique, ville, prix, stock, ajout au panier) |
| Ville du client pour l'offre affichée | **Cookie de la ville choisie** (`kemdia_ville`), lu par le serveur et envoyé à l'API (`?ville=`)   |
| Ajout d'un produit par un vendeur     | **Chercher d'abord** une fiche en ligne ; sinon créer la fiche, **photos d'abord**                 |
| Erreur sur une fiche en ligne         | **Message libre** du vendeur, dans une **file de l'équipe** qui corrige puis clôt avec une réponse |

## Décision

1. **Page produit.** Le serveur lit le cookie `kemdia_ville` et demande la fiche avec `?ville=`. L'offre affichée
   (« Vendu par … ») est celle que l'API met en avant. Le bloc « Autres vendeurs » montre les autres offres de la
   **même déclinaison**. Chaque bouton ajoute au panier la variante de **cette** boutique : le panier les sépare déjà
   par boutique.
2. **Cookie de ville.** Il est écrit par le navigateur quand le client choisit sa ville, ou au premier chargement s'il
   manque. Attributs : `Path=/`, `SameSite=Lax`, `Secure` en HTTPS, un an. Il ne contient qu'un nom de ville, déjà
   gardé dans le navigateur, et figure dans la politique de confidentialité. L'API ne s'en sert que pour départager
   deux offres au même prix.
3. **« Vendre ce produit ».** « Ajouter un produit » commence par une recherche parmi les fiches en ligne. Sur une
   fiche trouvée, le vendeur coche les déclinaisons qu'il vend, avec son prix et son stock : l'offre est en ligne tout
   de suite. Sinon, « Créer une nouvelle fiche » ouvre le formulaire, photos en premier. Les photos sont réduites dans
   le navigateur et envoyées juste après la création, par la route photo existante. Le vendeur peut ensuite ajouter
   une autre déclinaison de la fiche à son offre.
4. **Propositions de correction.** Nouvelle table `catalog.listing_corrections` : message de 10 à 500 caractères,
   clôture avec une réponse facultative de 300 caractères au plus. Les contraintes sont tenues par la base. Une
   boutique ne propose une correction que sur une fiche **en ligne** où elle vend une offre. Elle a **10 propositions
   ouvertes** au plus ; un verrou consultatif par boutique, dans la transaction, empêche de dépasser la limite par
   des envois simultanés. Routes :
   - `POST /vendors/products/{id}/corrections` (vendeur) ;
   - `GET /moderation/listing-corrections` (ouvertes ou closes, filtrées par fiche) ;
   - `POST /moderation/listing-corrections/{id}/close` (équipe, double authentification).

   Le journal d'audit reçoit `listing.correction_proposed` et `listing.correction_closed`. Personne ne clôt la
   proposition de sa propre boutique.

5. **Espace de l'équipe.** Nouvelle section « Fiches produits » avec :
   - la file des propositions ouvertes ;
   - la recherche et la liste des fiches ;
   - pour chaque fiche : correction recopiée sur toutes les offres, retrait d'une photo, offres avec retrait motivé, propositions de cette fiche, fusion d'un doublon en deux temps (choix de la cible, puis correspondance de chaque déclinaison vendue).

   Les règles restent dans l'API (ADR-0049). Le site n'envoie que des identifiants vérifiés.

## Conséquences

- Le client voit **tous les vendeurs** d'un produit et choisit le plus proche ou le moins cher. Deux exemplaires chez
  deux vendeurs s'ajoutent en deux clics.
- Les doublons diminuent : le vendeur trouve la fiche existante avant d'en créer une.
- Le vendeur garde une voie pour corriger une fiche en ligne, sans pouvoir la modifier lui-même.
- Contrat de l'API **1.25.0** : 4 routes ; `VendorProduct.listing.variants` ajouté.
- **Limites** :
  - le vendeur ne voit pas encore la réponse de l'équipe dans son espace ; elle est gardée en base et au journal ;
  - le cookie ne sert que la page produit : les listes restent triées par prix ;
  - la recherche « Vendre ce produit » est une recherche par mots, sans tolérance aux fautes (prévue au S7.5-T06).
