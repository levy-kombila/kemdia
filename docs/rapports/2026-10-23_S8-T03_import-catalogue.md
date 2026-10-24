# Rapport — S8-T03 : import du vrai catalogue

|                                                 |                                                      |
| ----------------------------------------------- | ---------------------------------------------------- |
| **Date**                                        | 2026-10-23                                           |
| **Sprint / tâches**                             | S8 — S8-T03                                          |
| **Version**                                     | v0.8.1 → (v0.9.x à la clôture du S8) ; contrat 2.7.0 |
| **Sections du cahier d'architecture modifiées** | §3.32 (nouvelle) — version 4.28                      |

## 1. Résumé

L'équipe Catalogue peut maintenant **importer le catalogue des vendeurs partenaires depuis un tableur** :

- Elle remplit le **modèle** (une ligne par variante) dans Excel ou Google Sheets, l'enregistre en **CSV** et l'envoie
  sur `/equipe/import` ;
- **« Vérifier »** liste **toutes** les erreurs (ligne, colonne, message) sans rien écrire : boutique ou catégorie
  inconnue, prix mal écrit, titre trop court, variantes en double… ;
- **« Importer »** écrit **tout le fichier, ou rien** : les produits arrivent **en attente de modération**, comme ceux
  qu'un vendeur envoie lui-même ; la boutique ajoute ses **photos**, puis l'équipe valide ;
- **Relancer le même fichier** ne crée **aucun doublon** (une référence déjà importée est ignorée).

Les **vrais fichiers** des vendeurs et les **photos HD** sont **en attente du client**.

```
Équipe — /equipe/import (Catalogue)
  Préparer le fichier : [Télécharger le modèle]   boutique ; reference ; titre ; … ; prix ; stock
  [ Choisir le fichier ]  [ Vérifier le fichier ]  [ Importer ]
  ✓ Fichier valable : 42 produits et 97 variantes à importer.   Wax Awa (wax-awa) : 42 produits
  ✗ 3 erreurs :  Ligne 12 | prix | montant entier en FCFA …   Ligne 30 | categorie | catégorie « pagne » inconnue
```

## 2. Fonctionnalités livrées

| Élément        | Ce qui change                                                                                                                           | Où                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Base           | Colonne `catalog.products.import_reference` (minuscules), **unique par boutique**                                                       | migration `20261023233000_import_catalogue`                   |
| Lecture du CSV | Séparateur « ; » ou « , », guillemets, retours à la ligne, BOM ; en-têtes sans accents ni casse ; lignes regroupées en produits         | `vendors/domain/catalog-import.ts`                            |
| Vérification   | Boutiques partenaires actives, catégories, références déjà importées, et **mêmes règles que la création d'un produit**                  | `catalog-import.service.ts`, `VendorCatalog.importSession`    |
| Import         | Un import à la fois, boutiques verrouillées, tout revérifié, une seule transaction ; journal `catalog.imported`                         | `catalog-import.service.ts`                                   |
| Routes         | `POST /admin/catalog-import/check` et `POST /admin/catalog-import` (corps `text/csv`, 2 Mo), équipe Catalogue + double authentification | `catalog-import.controller.ts`, `catalog-import.openapi.ts`   |
| Site           | Page `/equipe/import` (modèle, aide par colonne, adresses des catégories, compte rendu) ; relais `/equipe/import/fichier`               | `app/equipe/import`, `components/staff/CatalogImportForm.tsx` |
| Contrat        | `CatalogImportReport`, colonnes et limites, codes `FICHIER_IMPORT_INVALIDE`, `IMPORT_EN_COURS`, `IMPORT_TROP_LONG` ; version **2.7.0**  | `packages/contracts`, `docs/api/openapi.json`                 |

## 3. Décisions techniques

Choix du 2026-10-23 : à ta demande, les **options recommandées** sont retenues sans t'être reposées. Les voici, pour
validation à la lecture de la PR :

- import par l'**équipe Catalogue** (et l'administrateur), double authentification ;
- fichier **CSV** (pas de .xlsx : une bibliothèque de plus pour un format binaire) ; **une ligne par variante** ;
  **2 Mo et 1 000 lignes** au plus ;
- **vérifier**, puis importer **tout ou rien** ;
- produits **en attente de modération** (pas de produit en ligne sans photo) ; photos ajoutées ensuite par la
  boutique (pas d'adresse d'image dans le fichier : l'API n'irait pas chercher des fichiers sur Internet) ;
- boutiques **des vendeurs partenaires** seulement (la boutique officielle Kemdia n'a ni modération ni vendeur pour
  ses photos) ;
- une référence déjà importée est **ignorée** (prix et stocks se changent dans « Mes produits »).

Décision complète : [ADR-0058](../architecture/adr/0058-import-catalogue.md).

## 4. Sécurité

### Relecture indépendante (agent séparé, avant la PR) : 0 critique, 0 haute, 2 moyennes, 5 basses, 4 infos

| Problème relevé                                                                                                                        | Correction                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moyenne : un faux jeton bien formé suffisait pour faire lire 2 Mo par requête, sans limite d'envois simultanés                         | **2 fichiers lus à la fois** au plus pour toute l'API, avant toute lecture du corps (même garde que les photos)                                                 |
| Moyenne : plusieurs imports simultanés (boutiques différentes) pouvaient occuper toutes les connexions à la base pendant 2 minutes     | **Un seul import écrit à la fois** (verrou en base, sans attente : `IMPORT_EN_COURS`) ; catégories lues **une fois** par fichier au lieu d'une fois par produit |
| Basse : un fichier Windows-1252 grossit en UTF-8 et pouvait dépasser 2 Mo, avec un message trompeur (« l'import a peut-être eu lieu ») | Taille revérifiée **après** conversion, message « fichier trop gros »                                                                                           |
| Basse : vérification et écriture n'appliquaient pas exactement les mêmes règles (titre « !!!!! », espaces, caractères invisibles)      | Chaque produit est **construit et vérifié par le catalogue lui-même** pendant la vérification ; prix barré plafonné ; testé sur la base                         |
| Basse : une référence d'import déjà prise aurait été prise pour une adresse déjà utilisée (3 essais puis erreur 500)                   | Contrainte en cause reconnue : erreur claire, sans nouvel essai                                                                                                 |
| Basse : une écriture trop longue s'affichait « boutique occupée »                                                                      | `IMPORT_TROP_LONG` : « rien n'a été importé, découpez le fichier »                                                                                              |
| Basse : le modèle sans BOM s'ouvrait mal dans Excel en français (« Ã© »)                                                               | Modèle enregistré avec le **BOM UTF-8**                                                                                                                         |
| Info : un membre de l'équipe peut valider des produits qu'il a importés                                                                | **Accepté et écrit** dans l'ADR-0058 (l'import recopie le fichier du vendeur ; modération tracée produit par produit)                                           |
| Info : une boutique peut dépasser sa limite de file de modération après un import                                                      | **Accepté et écrit** dans l'ADR-0058                                                                                                                            |
| Info : textes commençant par `=`, `+`, `-`, `@` acceptés                                                                               | **Accepté** : aucun export CSV n'existe ; à neutraliser le jour où il y en aura un                                                                              |
| Info : imports mal placés dans le module ; colonnes en double (domaine et contrat) ; boutiques affichées sous une erreur d'import      | Imports déplacés ; **test d'alignement** domaine ↔ contrat ; compte rendu vidé quand l'import est annulé                                                        |

Sans problème selon la relecture : routes réservées à l'équipe Catalogue avec la double authentification (API et
site) ; corps non lu sans jeton ; relais du site qui vérifie session et rôle avant de lire ; origine contrôlée par
`proxy.ts` ; lecture en flux bornée ; analyse linéaire ; compte rendu affiché en texte par React ; requête SQL
paramétrée ; tout ou rien dans une transaction ; références en minuscules contrôlées par la base ; pas
d'interblocage entre imports ; boutiques revérifiées sous verrou ; tous les produits en attente ; journal sans
donnée personnelle ; encodages et caractères interdits ; architecture respectée.

### Dépendance

| Problème relevé                                                                                                                  | Correction                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Audit des dépendances : faille **haute** publiée le 2026-10-23 dans body-parser `< 2.4.0` (déni de service, GHSA-27r3-jxmh-p828) | body-parser imposé en **2.4.0** (`overrides` de `pnpm-workspace.yaml`) en attendant qu'Express le relève ; tous les tests relancés ✓ |

## 5. Qualité

- Format et lint sur tout le dépôt, typecheck et build : ✓.
- API : **657 tests unitaires** ✓, dont la lecture du CSV (séparateurs, guillemets, BOM), le regroupement en
  produits, la collecte de toutes les erreurs, l'alignement domaine ↔ contrat.
- API : **256 tests d'intégration** sur une vraie base neuve ✓, dont `catalog-import.int.test.ts` (vérifier sans
  écrire, import en attente de modération, aucun doublon au second import, erreur → rien d'écrit, boutique officielle
  ou suspendue refusée, mêmes règles que la création, accès réservé à l'équipe Catalogue, corps CSV obligatoire).
- Site : **493 tests** ✓ (dont décodage UTF-8 / Windows-1252) ; contrat : **34 tests** ✓ ; description OpenAPI
  régénérée (contrat 2.7.0).
- Bout en bout (CI) : page `/equipe/import` avec l'accessibilité.
- Migration appliquée sur une base neuve avec toutes les précédentes.
- `pnpm audit --prod` sans faille ; Gitleaks v8.30.1 ✓ ; Semgrep, Playwright, CodeQL et ZAP : par la CI.

## 6. Captures d'écran

La page est parcourue par les tests de bout en bout de la CI et sera visible sur la démo après le déploiement.

## 7. Limites connues / dette technique

- **Fichiers réels et photos HD : en attente du client.**
- Pas de **mise à jour** des produits par import (prix, stocks) : « Mes produits » pour l'instant.
- Pas de fichier **Excel (.xlsx)** : enregistrer en CSV.
- La boutique officielle **Kemdia** n'est pas importable ; la gestion de ses produits reste à prévoir.
- Un gros import remplit la file de modération : prévoir le temps de l'équipe pour la valider.

## 8. Prochaines étapes

- Après la fusion : `pnpm --filter @kemdia/api db:deploy`, puis `db:check` (nouvelle colonne
  `catalog.products.import_reference`) ; attendre « Déploiement DÉMO (Render) ».
- Dès réception des fichiers des vendeurs : les mettre au format du modèle, vérifier, importer ; chaque boutique
  ajoute ses photos ; l'équipe valide dans « Modération ».
- S8-T04 proposée : accueil durablement sous 300 ms (dette S7-T03).
