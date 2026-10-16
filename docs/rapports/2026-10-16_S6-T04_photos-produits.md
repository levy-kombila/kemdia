# Rapport — S6-T04 : photos des produits des vendeurs

|                                                 |                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| **Date**                                        | 2026-10-16                                                                |
| **Sprint / tâches**                             | S6 — S6-T04                                                               |
| **Version**                                     | v0.5.0 (versions des paquets inchangées) ; contrat de l'API 1.17.0        |
| **Sections du cahier d'architecture modifiées** | §3.5, §3.7, §3.10, §3.19 (nouvelle), §5.14 (nouvelle), §6.4 — version 4.1 |

## 1. Résumé

Un vendeur peut maintenant **ajouter des photos** à ses produits (10 au plus, JPEG, PNG ou WebP, 5 Mo). Le fichier n'est **jamais
gardé tel quel** : l'API le réencode en WebP, en deux tailles, et retire tout ce que le téléphone y avait mis (position GPS, modèle
de l'appareil). Ajouter une photo **renvoie le produit en modération** : rien n'est visible du public sans validation. Le site
affiche ces photos à la même adresse que les autres (`/images/v/…`), grâce à un relais.

```
Vendeur ─► POST …/images (le fichier) ─► vérification rapide ─► réencodage WebP 1600 + 480 px, sans métadonnées
   └─► photo rangée + produit « en attente » ─► modérateur (voit la photo, 2FA) ─► validé
Visiteur ─► /images/v/<id>-480.webp ─► relais du site ─► API : produit visible ? ─► photo (cache 60 s) ou 404
```

## 2. Fonctionnalités livrées

| Élément             | Ce que ça fait                                                                                                           | Fichiers principaux                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| Routes du vendeur   | `POST /api/v1/vendors/products/{id}/images` (envoi), `PUT` (ordre), `GET …/{imageId}` (aperçu), `DELETE` (retrait)       | `vendors/interface/vendor-product-image.controller.ts`            |
| Route de modération | `GET /api/v1/moderation/products/{id}/images/{imageId}` : la photo, quel que soit le statut (modérateur + 2FA)           | `vendors/interface/moderation-image.controller.ts`                |
| Route publique      | `GET /api/v1/product-images/{imageId}/{large\|small}` : seulement pour un produit validé d'une boutique active           | `catalog/interface/product-image.controller.ts`                   |
| Règles              | Format par le contenu, 5 Mo, 200 px au moins, 10 photos, nouvel ordre = les mêmes photos                                 | `catalog/domain/product-image.ts`                                 |
| Réencodage          | sharp : 40 mégapixels, première image, redressée, WebP sans métadonnées, vignette tirée de la grande image               | `catalog/infrastructure/sharp-image-processor.ts`                 |
| Rangement           | Table `catalog.product_images` (port remplaçable par un stockage objet)                                                  | `catalog/infrastructure/prisma-product-image.store.ts`, migration |
| Corps binaire       | Lu seulement à l'adresse d'envoi, pour les types d'image, avec un jeton valide ; 6 envois en cours au plus               | `src/http/configure-app.ts`                                       |
| Site                | Relais `/images/v/[file]` ; `ProductImage` remplace `next/image` partout (vignette dans les listes, grande sur la fiche) | `app/images/v/[file]/route.ts`, `components/ui/ProductImage.tsx`  |
| Base                | Migration `20261016130000_photos_produits` (1 table, contraintes, déclencheur « jamais modifiée »)                       | `prisma/schema/catalog.prisma`                                    |
| Bout en bout        | Boutique + produit validé + photo insérés par la CI ; parcours `photos-vendeur.spec.ts`                                  | `e2e/fixtures/photos-vendeur-e2e.sql`, `.github/workflows/ci.yml` |

Nouvelle dépendance : **sharp 0.35.5** dans l'API (déjà utilisée par le site pour les aperçus ; gratuite, aucun service externe).

## 3. Décisions techniques

[ADR-0035](../architecture/adr/0035-photos-produits-vendeurs.md), avec tes choix du 2026-10-16 : **dans PostgreSQL** (port
remplaçable), **tout réencoder**, **photo ajoutée = nouvelle modération**, **affichage par un relais du site**.

Les photos des vendeurs ne passent **jamais** par l'optimiseur d'images de Next.js : il garde ses copies 24 heures, même pour une
photo retirée. `next.config.ts` n'autorise plus l'optimiseur que pour les dossiers fixes (`/images/products`, `/images/categories`,
`placeholder.svg`).

## 4. Sécurité

- **Modération** : une photo ajoutée remet le produit en attente avec une nouvelle date d'envoi ; un modérateur qui n'a pas vu la
  photo ne peut pas valider (règle S6-T02). Une photo ne se modifie jamais (déclencheur SQL) : on ne peut pas la remplacer après
  validation. La route publique refuse toute photo d'un produit non validé, d'une boutique suspendue, ou retirée de la liste.
- **Fichiers piégés** : format reconnu par les premiers octets **et** par le décodeur ; SVG, HTML, GIF, PDF refusés ; « bombe »
  de 8 000 × 8 000 refusée (40 mégapixels au plus) ; réencodage limité à 15 s.
- **Vie privée** : aucune métadonnée dans les photos servies (testé : ni EXIF, ni profil, ni XMP).
- **Isolement** : une boutique ne voit, n'ajoute ni ne retire les photos d'une autre (404) ; une photo n'est servie qu'avec son propre produit.
- **Défense en profondeur** : la base refuse autre chose qu'un WebP, plus de 2 Mo, plus de 1 600 px, et toute modification.

**Relecture de sécurité indépendante** (agent séparé, avant la PR) : **aucun problème critique** ; deux importants et quatre
mineurs, tous liés à la charge du serveur ou à la traçabilité. Corrigé :

| Gravité   | Trouvé                                                                                                                        | Correction                                                                                       |
| --------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Important | Le relais du site n'envoyait pas l'adresse du visiteur : aucune limite par visiteur ; octets lus avant le contrôle du produit | Adresse du visiteur transmise ; produit vérifié **avant** de lire les octets                     |
| Important | 5 Mo lus avant toute authentification, avec n'importe quel « Bearer x »                                                       | Jeton exact exigé avant la lecture ; **6 envois en cours au plus** pour toute l'API (503 sinon)  |
| Mineur    | Réencodage sans délai ni limite de concurrence                                                                                | **2 réencodages à la fois**, 15 s au plus ; la source n'est décodée qu'une fois                  |
| Mineur    | Réencodage lancé avant de savoir si le produit peut recevoir la photo                                                         | Vérification rapide (produit à la boutique, pas archivé, moins de 10 photos) avant le réencodage |
| Mineur    | Vignette calculée depuis l'original, et non depuis l'image vue par la modération                                              | Vignette **tirée de la grande image** (testé)                                                    |
| Mineur    | Aucune trace exploitable d'une photo illicite retirée                                                                         | Identifiant et **empreinte SHA-256** au journal (ajout, retrait) ; nouvel ordre tracé            |
| Remarque  | Effacement sans filtre sur le produit                                                                                         | Effacement limité au produit de la photo                                                         |

**Gardé et noté** (ADR-0035) : formats très allongés acceptés (200 × 199 999 px : la photo reste lisible, juste étroite) ; une photo
retirée reste visible au plus 6 minutes dans les caches ; la photo d'un produit refusé n'apparaît plus dans l'historique des
commandes ; l'aperçu vendeur ne sert que la grande image.

## 5. Qualité

GitHub Actions étant bloqué, tout a été lancé **en local** (espace de travail cloud, PostgreSQL 16) :

| Vérification                             | Résultat                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Format, lint, types (tout le dépôt)      | ✅                                                                                                                                 |
| Construction de l'API et du site         | ✅ (site construit avec une API **injoignable**, comme en CI)                                                                      |
| Tests unitaires de l'API                 | ✅ **541** (519 avant ; +22 : règles, réencodage réel avec sharp, service, limite des envois, alignement)                          |
| Tests d'intégration (base `kemdia_test`) | ✅ **178** (172 avant ; +6 : parcours complet, fichiers refusés, retrait, isolement, suspension, 10 photos, règles SQL)            |
| Tests du site / du contrat               | ✅ 287 (280 avant) / 32 (30 avant)                                                                                                 |
| Bout en bout (Playwright)                | ✅ **57 réussis**, 12 ignorés comme d'habitude (API en démo + Mailpit, `E2E_SANDBOX=1`) ; 2 nouveaux parcours × 2 appareils        |
| Budget de performance                    | ✅ JavaScript : 168 à 171 Ko par page, comme avant (voir ci-dessous)                                                               |
| Gitleaks v8.30.1 (empreinte vérifiée)    | ✅ (voir la PR)                                                                                                                    |
| `db:check` (migration ↔ schéma Prisma)   | ✅ « No difference detected », code 0, avec le moteur Prisma en WebAssembly (même calcul que `db:check`) ; **à relancer chez toi** |

Le budget de performance a attrapé une erreur pendant le travail : le composant d'image importait le contrat entier, ce qui
ajoutait **100 Ko de JavaScript** à chaque page (le panier dépassait son budget). Corrigé en n'important que les constantes.

## 6. Captures d'écran

Aucune : pas encore d'écran pour le vendeur (API seule). Le parcours Playwright vérifie qu'une photo de vendeur s'affiche sur la
fiche produit.

## 7. Limites connues / dette technique

- Pas d'écran d'envoi : l'espace vendeur viendra plus tard au S6.
- La base grossit (environ 150 à 400 Ko par photo, deux tailles) : à surveiller sur la démo (Neon gratuit, 0,5 Go). Passer à un
  stockage objet quand le volume l'exigera : service payant, **à discuter avec le client**.
- Pas de CDN : chaque photo passe par le site puis l'API.
- Aperçus de partage (WhatsApp) : ils n'affichent pas encore les photos des vendeurs.

## 8. Prochaines étapes

1. **Toi, d'abord** : fusionner la PR #56 (correctif de `db:check`). Cette PR la contient déjà ; elle disparaîtra du diff une
   fois #56 fusionnée.
2. **Toi, avant de fusionner celle-ci** : `pnpm install` (nouvelle dépendance sharp), puis `pnpm --filter @kemdia/api db:deploy` et
   `pnpm --filter @kemdia/api db:check` (port 5433).
3. La démo Render ne se met plus à jour toute seule : la migration y sera appliquée au prochain déploiement manuel.
4. Suite du S6 (proposée) : KYC (BR-024), site branché (espace vendeur avec l'envoi des photos, écrans de l'équipe), commandes
   vendeur (BR-013), commissions (question n° 3).
