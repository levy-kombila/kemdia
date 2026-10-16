# ADR-0035 — Photos des produits des vendeurs

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Tâche** : S6-T04
- **Complète** : [ADR-0033](0033-produits-vendeurs-moderation.md) (produits des vendeurs et modération)

## Contexte

Depuis le S6-T02, un vendeur crée ses produits, mais sans photo : le champ `products.images` reste vide. Les photos du catalogue
Kemdia sont des fichiers fixes du site (`public/images/products`). Il faut maintenant laisser un vendeur envoyer ses photos depuis
son téléphone, sans ouvrir de faille : fichier piégé, image non modérée visible du public, position GPS dans les métadonnées,
hébergement d'images étrangères, saturation du serveur.

Choix du propriétaire (2026-10-16) :

| Question              | Choix                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Où ranger les photos  | **Dans PostgreSQL**, derrière un port remplaçable (stockage objet plus tard) : gratuit, déjà sauvegardé |
| Fichier reçu          | **Toujours réencodé** : jamais servi tel quel                                                           |
| Photo ajoutée         | Le produit **repasse en modération** (comme un contenu modifié, BR-003)                                 |
| Affichage sur le site | **Oui, par un relais du site** (`/images/v/…`), même adresse que les autres photos                      |

## Décision

| Sujet          | Choix                                                                                                                                                                                                                      | Raison                                                                                                         |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Envoi          | `POST /api/v1/vendors/products/{id}/images`, corps = **le fichier lui-même** (JPEG, PNG, WebP, 5 Mo) ; lu en binaire seulement à cette adresse, pour ces types, avec un jeton bien formé                                   | Pas de formulaire multipart à analyser ; les autres routes gardent la limite JSON de 100 ko                    |
| Format         | Reconnu par ses **premiers octets** (pas le nom ni le type annoncé), puis par le décodeur : les deux doivent concorder                                                                                                     | Un SVG ou une page HTML renommés sont refusés avant tout décodage                                              |
| Réencodage     | sharp (libvips) : 40 mégapixels au plus, première image seulement, orientation appliquée, **WebP sans aucune métadonnée**, 1 600 px et vignette de 480 px **tirée de la grande image**                                     | Ni position GPS ni appareil servis ; la vignette ne peut pas montrer autre chose que ce que voit la modération |
| Charge         | 2 réencodages à la fois dans toute l'API, 15 s au plus chacun ; 6 envois en cours au plus (503 sinon) ; vérification rapide (produit, statut, place) **avant** le réencodage ; 20 envois/min/compte                        | Le corps est lu avant les contrôles de la route : il faut borner la mémoire et le calcul                       |
| Rangement      | `catalog.product_images` (deux tailles, dimensions, SHA-256), contraintes SQL (WebP, 2 Mo, 1 600 px) ; **une photo ne se modifie jamais** (déclencheur) ; port `ProductImageStore`                                         | Une photo validée ne peut pas être remplacée en douce ; stockage objet possible plus tard                      |
| Adresse        | `/images/v/<id>.webp` rangée dans `products.images` (vignette : `…-480.webp`), identifiant tiré au hasard par le serveur                                                                                                   | Cartes, panier et commandes fonctionnent sans changement                                                       |
| Modération     | Ajouter → produit en attente (nouveau `submittedAt`, la décision porte sur la version lue) ; retirer et changer l'ordre → sans modération ; la modération voit la photo (2FA)                                              | BR-003 : rien de nouveau n'est visible sans validation                                                         |
| Photo publique | `GET /api/v1/product-images/{id}/{large\|small}` : seulement si le produit est **validé**, sa boutique **active** et la photo **encore dans sa liste** ; produit vérifié avant la lecture des octets ; 404 identique sinon | On ne peut pas se servir de Kemdia pour héberger une image non modérée                                         |
| Cache          | 60 s (+ 5 min pendant la mise à jour) comme le catalogue ; ETag ; `private, no-store` pour le vendeur et la modération                                                                                                     | Une photo retirée ou un produit caché disparaît en 6 minutes au plus                                           |
| Site           | Relais `app/images/v/[file]/route.ts` (clé interne + adresse du visiteur, limite par visiteur) qui ne relaie qu'un WebP vérifié ; `ProductImage` : photos des vendeurs **sans** l'optimiseur de Next.js                    | L'optimiseur garde ses copies 24 h, même pour une photo retirée                                                |
| Journal        | `product.submitted` (raison `photo`, `image`, `sha256`), `product.image_removed` (`image`, `sha256`), `product.images_reordered`                                                                                           | Une image illicite publiée puis retirée laisse une trace                                                       |
| Contrat        | 1.17.0 : routes ci-dessus ; `ProductImageOrderRequest` ; codes `FORMAT_IMAGE_INVALIDE`, `IMAGE_TROP_GRANDE`, `IMAGE_TROP_PETITE`, `TROP_DE_PHOTOS`, `PHOTO_INTROUVABLE`                                                    | Écrans du vendeur plus tard au S6                                                                              |

## Options écartées

- **Stockage objet (S3, R2, Cloudinary)** : payant ou nouveau compte à gérer (budget du client) ; le port permet d'y passer plus tard.
- **Fichiers sur le disque du serveur** : perdus à chaque redéploiement de l'image Docker (Render), non sauvegardés.
- **Garder le fichier d'origine** : métadonnées (GPS), formats piégés, poids ; aucun besoin au MVP.
- **Servir les photos par l'optimiseur de Next.js** : cache de 24 h impossible à vider pour une photo retirée.
- **Formulaire multipart** : un analyseur de plus, sans gain pour un seul fichier.

## Conséquences

- ➕ Les vendeurs peuvent montrer leurs produits ; rien n'est visible sans modération ; aucune métadonnée ne sort.
- ➕ Aucun service payant ; les photos sont sauvegardées avec la base.
- ➖ La base grossit : environ 150 à 400 Ko par photo (deux tailles), 10 photos au plus par produit. À surveiller (Neon gratuit : 0,5 Go) ; passer au stockage objet quand le volume l'exige (à discuter avec le client : budget).
- ➖ Chaque photo publique passe par le site puis l'API (pas encore de CDN) : le cache de 60 s ne sert que si un CDN est placé devant.
- ➖ Les aperçus de partage (OpenGraph) n'affichent pas encore les photos des vendeurs (ils lisent les fichiers du site).
- ➖ Une photo d'un produit refusé ou d'une boutique suspendue n'apparaît plus dans l'historique des commandes du client.
- ➖ Migration à appliquer (`db:deploy`) avant de déployer l'API : nouvelle table seulement, l'ancienne API l'ignore.
