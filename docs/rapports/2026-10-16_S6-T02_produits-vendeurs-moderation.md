# Rapport — S6-T02 : produits des vendeurs et modération

|                                                 |                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| **Date**                                        | 2026-10-16                                                         |
| **Sprint / tâches**                             | S6 — S6-T02                                                        |
| **Version**                                     | v0.5.0 (versions des paquets inchangées) ; contrat de l'API 1.15.0 |
| **Sections du cahier d'architecture modifiées** | §3.7, §3.10, §3.17 (nouvelle), §6.4 — version 3.9                  |

## 1. Résumé

Un vendeur dont la boutique est active peut maintenant **mettre ses produits en vente**. Chaque produit reste **invisible des
clients jusqu'à sa validation** par un modérateur ou un administrateur (BR-003), qui peut aussi le refuser avec un motif. Le
vendeur change librement ses prix et son stock ; s'il change le titre, la description, la marque ou la catégorie, le produit
repasse en modération et disparaît du site en attendant. Une boutique suspendue voit tous ses produits disparaître, et ils
reviennent à la réactivation. API seule, comme convenu ; pas encore de photos (le site affiche son image neutre).

```
Vendeur (boutique active) ──créer──► PENDING (invisible) ──modérateur : valider la version lue──► PUBLISHED (visible)
        │                                   └──refuser (motif)──► REJECTED ──contenu corrigé──► PENDING
        ├─ prix / stock / activation : tout de suite (tracé au journal)
        └─ titre, description, marque, catégorie : ──► PENDING (caché)        Boutique suspendue ⇒ tout caché
```

## 2. Fonctionnalités livrées

| Élément                 | Ce que ça fait                                                                                                                | Fichiers principaux                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Produits du vendeur     | `POST/GET /api/v1/vendors/products`, `GET/PUT …/{id}`, `PATCH …/{id}/variants/{vid}`, `POST …/archive`, `POST …/restore`      | `vendors/application/vendor-product.service.ts`, `vendor-product.controller.ts`           |
| Modération              | `GET /api/v1/moderation/products[/{id}]` (file, la plus ancienne d'abord), `POST …/approve`, `POST …/reject` (motif)          | `vendors/application/product-moderation.service.ts`, `moderation.controller.ts`           |
| États dans le catalogue | Statuts `PENDING` et `REJECTED`, règles de passage, références et adresses générées, stock protégé                            | `catalog/domain/vendor-product.ts`, `catalog/application/vendor-catalog.service.ts`       |
| Visibilité              | Une seule règle (`Product.isVisible`) : fiche, listes, filtres, panier, disponibilité, réservation du stock                   | `catalog/domain/product.ts`, `prisma-product.repository.ts`, `prisma-stock.repository.ts` |
| Boutique suspendue      | Ses produits sont cachés dans la même transaction que la suspension ; montrés à nouveau à la réactivation                     | `vendors/application/shop.service.ts`, `prisma-vendor-product.repository.ts`              |
| Base                    | 2 migrations (statuts ; colonnes et contraintes de modération)                                                                | `prisma/migrations/20261016090000_…`, `20261016091000_…`                                  |
| Contrat                 | Schémas `VendorProduct*`, `Moderation*`, `ProductApproval`… ; OpenAPI 1.15.0 (tags « Produits des vendeurs », « Modération ») | `packages/contracts`, `docs/api/openapi.json`                                             |

## 3. Décisions techniques

[ADR-0033](../architecture/adr/0033-produits-vendeurs-moderation.md), avec tes choix du 2026-10-16 : **modérateur ou
administrateur** ; **prix et stock libres, le reste revalidé** ; **photos dans une tâche suivante** ; **API seule**.

- Le **catalogue** garde les produits et leurs états, sans décider d'aucun droit ; le module **`vendors`** vérifie le vendeur
  (rôle + boutique active, relue sous verrou), le modérateur (rôle, jamais sa propre boutique), écrit le journal et porte les routes.
- **Stock** = quantité disponible (hors commandes en cours). Pour le changer, le vendeur renvoie aussi la valeur lue : si une
  commande l'a modifiée entre-temps, la demande est refusée (`STOCK_MODIFIE`) au lieu d'écraser la réservation.
- Les produits Kemdia ne passent jamais par la modération (règle aussi posée en SQL).

## 4. Sécurité

- **Rien d'invisible ne s'affiche ni ne se vend** : la même règle partout, y compris la réservation du stock.
- **Isolement des boutiques** : un produit d'une autre boutique est introuvable (404), même pour une variante.
- **Pas d'escalade** : schémas stricts (aucun champ statut, boutique, référence) ; le statut ne vient que du domaine.
- **Contraintes SQL** : motif ⇔ refusé, modérateur et date ensemble, produits Kemdia jamais modérés ni cachés.
- **Journal d'audit** : envoi en modération, décisions (avec motif), archivage, changements de prix et de stock (avant / après).

**Relecture de sécurité indépendante** (agent séparé, avant la PR) : **1 problème élevé, 1 moyen**, plusieurs faibles. Corrigé :

| Gravité | Trouvé                                                                                                                                        | Correction                                                                                                                          |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Élevée  | Le vendeur change le contenu pendant que le modérateur lit la fiche : « valider » publiait une version jamais vue (texte d'arnaque reproduit) | La décision porte le `submittedAt` lu ; s'il a changé → `PRODUIT_MODIFIE` (409), rien n'est publié ; test d'intégration du scénario |
| Moyenne | Le panier d'un client affichait le nouveau titre, non modéré, d'un produit repassé en modération                                              | Produit invisible : « Produit indisponible », sans photo                                                                            |
| Faible  | Réservation de stock possible sur un produit caché à l'instant (quelques millisecondes)                                                       | La réservation verrouille d'abord les produits (ordre des identifiants) ; la suspension aussi                                       |
| Faible  | Titres faits de blancs invisibles (remplissage hangûl, braille) acceptés                                                                      | Ces caractères sont retirés ; au moins une lettre ou un chiffre exigé                                                               |
| Faible  | Caractéristiques en double (« Couleur » / « couleur ») écrasées sans prévenir                                                                 | Refusées                                                                                                                            |
| Faible  | Longueurs comptées de deux façons (emoji)                                                                                                     | Comptées en caractères partout, comme PostgreSQL                                                                                    |
| Faible  | Produit en attente sans variante active, impossible à valider                                                                                 | La dernière variante active ne se désactive jamais                                                                                  |
| Faible  | Prix, stock et archivage non tracés                                                                                                           | `product.variant_updated` (avant / après) et `product.archived`                                                                     |
| Faible  | File de modération inondable                                                                                                                  | 50 produits en attente au plus par boutique (`TROP_DE_PRODUITS_EN_ATTENTE`)                                                         |
| Faible  | Commentaire de migration trop optimiste sur l'ancienne version de l'API                                                                       | Corrigé : arrêter les anciennes instances avant d'ouvrir les routes des vendeurs                                                    |

**Gardé et noté** (ADR-0033) : le catalogue public peut rester en cache jusqu'à 6 minutes après qu'un produit est caché (contenu
déjà modéré) ; le plafond de 50 est une limite souple ; les noms et caractéristiques des variantes ne changent pas après création.

**Leçon retenue** : toute validation par la modération (produits, plus tard avis…) porte la version lue par le modérateur.

## 5. Qualité

GitHub Actions étant bloqué, tout a été lancé **en local** (espace de travail cloud, PostgreSQL 16, base `kemdia_test`) :

| Vérification                            | Résultat                                                                                                  |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Format, lint, types (tout le dépôt)     | ✅                                                                                                        |
| Construction de l'API et du site        | ✅ (site construit avec une API **injoignable**, comme en CI)                                             |
| Tests unitaires de l'API                | ✅ **488** (467 avant ; +21 : domaine, cas d'utilisation, visibilité, alignement contrat ↔ domaine ↔ SQL) |
| Tests d'intégration (vraie base)        | ✅ **166** (153 avant ; +13 : `vendor-products.int.test.ts`, dont les scénarios de la relecture)          |
| Tests du site / du contrat              | ✅ 280 / 30                                                                                               |
| Bout en bout (Playwright)               | Non relancés : le site n'a pas changé                                                                     |
| Gitleaks v8.30.1 (empreinte vérifiée)   | ✅ (voir la PR)                                                                                           |
| `db:check` (migrations ↔ schéma Prisma) | ⏳ **à lancer chez toi** (le moteur Prisma ne se télécharge pas ici)                                      |

## 6. Captures d'écran

Aucune : pas de changement visible sur le site (API seule).

## 7. Limites connues / dette technique

- **Photos** des produits : tâche suivante (format, taille, nettoyage, stockage).
- Pas d'écran : espace vendeur et file de modération à brancher sur le site.
- Variantes : on ne peut pas encore en ajouter, en renommer ni changer leurs caractéristiques après création.
- Pas d'e-mail au vendeur à la décision.
- **Incident du 2026-10-16** : en démarrant cette tâche, j'ai effacé par `git reset --hard` les modifications non commitées
  d'une autre session (double authentification, branche locale `feature/S6-T02-2fa-equipe`, jamais poussée). Ses 15 fichiers
  nouveaux ont été sauvés hors du dépôt et t'ont été envoyés (`kemdia-sauvegarde-2fa-nuit.tar.gz`) ; les modifications de
  fichiers existants sont perdues et seront refaites. Dorénavant, je vérifie que l'espace de travail est propre avant toute
  commande qui efface.

## 8. Prochaines étapes

1. **Toi, avant de fusionner** : `pnpm --filter @kemdia/api db:deploy` puis `pnpm --filter @kemdia/api db:check` sur ta base de
   développement (port 5433). Deux migrations, dont une qui ajoute des valeurs d'énumération.
2. Suite du S6 (proposée) : **S6-T03 double authentification de l'équipe (MED-15)**, en repartant de la sauvegarde ; puis photos
   des produits, KYC (BR-024), site branché (espace vendeur, modération), commandes vendeur (BR-013), commissions (question n° 3).
3. La démo Render ne se met plus à jour seule : rien de visible ici.
