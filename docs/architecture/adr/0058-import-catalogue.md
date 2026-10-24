# ADR-0058 — Import du vrai catalogue par l'équipe Catalogue

- **Statut** : Accepté
- **Date** : 2026-10-23
- **Tâche** : S8-T03 (vrai catalogue des vendeurs partenaires avant la bêta)
- **Complète** : [ADR-0033](0033-produits-vendeurs-moderation.md) (création et modération des produits des
  vendeurs), [ADR-0049](0049-fiches-communes-offres.md) (fiches communes et offres)

## Contexte

Le catalogue en ligne est celui de la démonstration (50 produits inventés). Pour la bêta, les vendeurs partenaires
fournissent leurs produits dans un tableur ; les saisir un par un dans « Mes produits » prendrait des jours, et la file
de modération d'une boutique est limitée. Les fichiers réels et les photos HD sont **en attente du client**.

Choix du 2026-10-23 : options recommandées retenues sans être reposées (demande du propriétaire), listées ici :

| Question                 | Choix retenu (recommandé)                                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Qui importe              | **L'équipe Catalogue** (et l'administrateur), avec la double authentification, depuis `/equipe/import`                   |
| Format                   | **CSV** (export d'Excel ou de Google Sheets) ; « ; » ou « , » ; UTF-8 ou Windows-1252 ; **une ligne par variante**       |
| Taille                   | **2 Mo et 1 000 lignes** au plus par fichier (découper au-delà)                                                          |
| Étapes                   | **Vérifier** (rien n'est écrit, toutes les erreurs listées), puis **Importer** (tout le fichier, ou rien)                |
| État des produits        | **En attente de modération**, comme un produit envoyé par un vendeur : la boutique ajoute ses photos, l'équipe valide    |
| Boutiques                | **Vendeurs partenaires actifs** seulement ; la boutique officielle Kemdia n'est pas importable                           |
| Relancer le même fichier | **Aucun doublon** : une référence déjà importée dans la boutique est ignorée (pas de mise à jour des prix ni des stocks) |
| Photos                   | **Pas dans le fichier** : ajoutées ensuite par chaque boutique (« Mes produits »), déjà réduites et sans métadonnées     |

## Décision

1. **Analyse** (domaine `vendors/domain/catalog-import.ts`, pure) : découpe RFC 4180 (guillemets, retours à la ligne
   dans un champ, BOM), séparateur deviné sur les en-têtes, en-têtes reconnus sans accents ni casse ; chaque champ
   vérifié avec les **mêmes limites** que la création d'un produit (titre, description, marque, variante, prix entier en
   FCFA, prix barré plus élevé, stock) ; caractères de contrôle et inversions du sens d'écriture refusés ; lignes d'une
   même boutique et d'une même référence regroupées en **un produit** (même fiche obligatoire, variantes distinctes,
   20 au plus). Toutes les erreurs sont collectées (100 détaillées au plus).
2. **Vérification** (`CatalogImportService`) : boutique par son adresse (active, partenaire), catégorie par son
   adresse, références déjà importées. `POST /admin/catalog-import/check` renvoie le compte rendu
   (`CatalogImportReport`) sans rien écrire.
3. **Import** (`POST /admin/catalog-import`) : boutiques **verrouillées** (même ordre), tout **revérifié sous le
   verrou**, puis chaque produit créé par `VendorCatalog.importProduct` (même chemin que la création par un vendeur,
   sans la limite de file d'attente) dans **une seule transaction** (2 minutes au plus) ; une erreur annule tout et
   apparaît dans le compte rendu. Journal `catalog.imported` (nombres, adresses des boutiques).
4. **Référence d'import** : colonne `catalog.products.import_reference` (minuscules, 40 caractères), **unique par
   boutique** (migration `20261023233000_import_catalogue`).
5. **Corps** : le fichier lui-même (`text/csv`, 2 Mo), lu en texte seulement à ces deux adresses et avec un jeton de
   session bien formé (comme les photos) ; les autres routes gardent la limite JSON de 100 ko.
6. **Site** : page `/equipe/import` (modèle à télécharger, aide par colonne, adresses des catégories, compte rendu
   en tableau) ; relais `/equipe/import/fichier` (session et rôle vérifiés avant de lire le corps, 2 Mo lus en flux,
   un import à la fois, décodage UTF-8 puis Windows-1252).
7. Contrat de l'API **2.7.0**.
8. **Garde-fous issus de la relecture de sécurité** :
   - **2 fichiers lus à la fois** au plus pour toute l'API, avant toute lecture du corps (comme les photos) ;
   - **un seul import écrit à la fois** (verrou consultatif en base, sans attente : `IMPORT_EN_COURS`) ; une écriture
     de plus de 2 minutes est annulée avec `IMPORT_TROP_LONG` (et non « boutique occupée ») ;
   - **mêmes règles** pour la vérification et l'écriture : chaque produit est construit et vérifié par le catalogue
     lui-même (texte nettoyé, au moins une lettre ou un chiffre, variantes distinctes après nettoyage, prix barré
     plafonné) ; catégories lues **une fois** par fichier ;
   - une référence d'import déjà prise devient une erreur claire (pas de nouveaux essais ni d'erreur 500) ;
   - site : taille revérifiée **après** conversion en UTF-8 ; modèle enregistré avec le **BOM UTF-8** (accents bien
     lus par Excel) ; compte rendu vidé des boutiques quand l'import est annulé.
9. **Points acceptés** (écrits ici) :
   - un membre de l'équipe Catalogue peut valider des produits qu'il a lui-même importés : l'import ne fait que
     recopier le fichier du vendeur, et la modération reste tracée produit par produit ;
   - une boutique peut dépasser sa limite de file de modération après un import : elle ne peut plus envoyer de
     nouveau produit tant que l'équipe n'a pas avancé (la modération des produits importés passe en premier) ;
   - textes commençant par `=`, `+`, `-` ou `@` acceptés : aucun export CSV n'existe ; à neutraliser le jour où il y
     en aura un.

## Conséquences

- Un fichier de vendeur entre en quelques minutes ; la modération et les photos restent par produit.
- La file de modération peut recevoir des centaines de produits d'un coup ; une boutique au-delà de sa limite de file
  ne peut plus envoyer de nouveau produit elle-même tant que l'équipe n'a pas validé.
- Les prix et stocks d'un produit déjà importé se changent dans « Mes produits », pas par un nouvel import.

## Alternatives écartées

- **Fichier Excel (.xlsx)** : il faudrait une bibliothèque de plus pour lire un format binaire complexe (surface
  d'attaque) ; tout tableur sait enregistrer en CSV.
- **Photos par adresse web dans le fichier** : l'API devrait télécharger des images d'Internet (risque SSRF, fichiers
  hors de contrôle) ; l'envoi par la boutique existe déjà et vérifie chaque photo.
- **Produits publiés directement** : des fiches sans photo seraient en ligne ; la modération reste la porte d'entrée.
- **Import ligne à ligne avec erreurs partielles** : un fichier à moitié importé est plus dur à corriger qu'un fichier
  refusé avec la liste de ses erreurs.
