# ADR-0011 — Le site lit l'API : source choisie au démarrage, contrat partagé, panier par variante

- **Statut** : Accepté — complété par l'[ADR-0013](0013-demo-render-api-neon.md) (S3-T07) : la démo lit l'API. **S3-T08 : le mode fichier est retiré** ; le site exige l'API partout
- **Date** : 2026-10-06
- **Tâche** : S3-T05

## Contexte

Jusqu'au S3-T04, le site lisait le catalogue dans un fichier JSON (`lib/catalog.ts`). L'API `/api/v1`
([ADR-0010](0010-api-rest-openapi.md)) sait maintenant tout servir. Il faut brancher le site dessus sans :

- **mentir au client** : un site qui bascule en silence sur des données de démonstration quand l'API tombe affiche
  des prix et des stocks faux ;
- **dépendre de l'API pour construire l'image** : la même image Docker sert la démo, le staging et la production
  (_build once, deploy many_), et l'API n'est pas joignable pendant `next build` ;
- **recopier le contrat** : deux descriptions des mêmes réponses (API et site) finissent par diverger ;
- **commander le mauvais article** : depuis le S3-T03, le stock est porté par la **variante** (FR-013), pas par le produit.

La démo Render n'a pas encore de base de données (S3-T07) : le fichier de démonstration doit rester disponible jusque-là.

## Décision

| Sujet              | Choix                                                                                                                                                                                | Raison                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Port du catalogue  | `CatalogPort` (`lib/catalog/port.ts`) avec **deux adaptateurs** : `api-catalog.ts` (HTTP) et `file-catalog.ts` (fichier) ; les pages n'appellent que `lib/catalog`                   | Architecture hexagonale côté site ; les composants ne savent pas d'où viennent les données      |
| Choix de la source | **Au démarrage, par configuration**, jamais en repli automatique : `API_URL` définie → API seule ; absente → fichier ; `APP_ENV=production` sans `API_URL` → **refus de démarrer**   | Une panne de l'API se voit (page d'erreur, 500) au lieu d'afficher de faux prix                 |
| Vérification       | `instrumentation.ts` valide la configuration (Zod, messages en français) et arrête le serveur (code 1) si elle est fausse                                                            | Une erreur de réglage est découverte au déploiement, pas par un client                          |
| Construction       | **Aucune lecture du catalogue pendant `next build`** : `connection()` rend chaque page dynamique, et une garde lève une erreur claire si une page essaie quand même                  | L'image se construit sans API ; une régression casse le build au lieu de figer des données      |
| Panne de l'API     | Délai maximal (`CATALOG_TIMEOUT_MS`, 5 s), réponse **validée par le contrat** ; tout écart → `CatalogUnavailableError` → page d'erreur. L'en-tête seul affiche un menu vide          | Une réponse inattendue n'est jamais affichée ; le reste du site (panier, comptes) reste lisible |
| Cache              | 60 s en mémoire dans le serveur du site (500 entrées au plus), requêtes identiques simultanées regroupées                                                                            | Même durée que le cache de l'API ; une page ne déclenche pas 5 fois la même requête             |
| Débit              | Le serveur du site présente `API_INTERNAL_KEY` (en-tête `x-kemdia-internal-key`), obligatoire avec `API_URL`                                                                         | Tous les visiteurs passent par une seule adresse : sans clé, le site serait limité (429)        |
| Contrat partagé    | Paquet **`packages/contracts`** (`@kemdia/contracts`) : schémas Zod, constantes, paramètres de recherche ; sous-chemin `/constants` sans Zod, `/demo` pour les données               | Une seule source de vérité : l'API documente et vérifie avec, le site valide avec               |
| Identifiants démo  | UUID v5 calculés depuis l'adresse (`demoIds`), **identiques** en mode API et en mode fichier                                                                                         | Un panier rempli sur la démo (fichier) reste valable quand la démo passera sur l'API (S3-T07)   |
| Panier             | Une ligne = une **variante** (`variantId`, plus `productId` pour l'affichage) ; nouvelle clé `kemdia.cart.v2`, l'ancienne est effacée ; la commande envoie `{ variantId, quantity }` | Le stock et le prix sont par variante (FR-013) ; BR-001 se vérifie sur ce qui est commandé      |
| Favoris            | Restent **par produit** (UUID) ; la variante par défaut est gardée pour « Ajouter au panier »                                                                                        | On aime un produit, pas une couleur précise                                                     |
| Choix de variante  | Sur la fiche, par l'adresse `?variante=<sku>` (lien, pas de JavaScript) ; dans les listes, « Choisir une option » dès 2 variantes                                                    | Partageable sur WhatsApp, fonctionne sans JavaScript, indexable                                 |

## Options écartées

- **Repli automatique sur le fichier si l'API ne répond pas** : le client verrait des prix et des stocks faux, et la panne passerait inaperçue.
- **Pages statiques régénérées (ISR)** : exigerait l'API pendant la construction, ou des pages vides en cache ; le cache de 60 s suffit pour ~500 produits.
- **Copier les schémas dans le site** : deux descriptions à tenir à jour. Générer un client depuis `openapi.json` : un outil de plus pour un contrat déjà écrit en Zod.
- **Garder l'ancien panier** (identifiants numériques) en le convertissant : les identifiants de démonstration n'ont aucun lien avec les UUID ; on l'écarte proprement.

## Conséquences

- ➕ L'image Docker se construit sans API (prouvé par la CI : construction avec une adresse injoignable).
- ➕ Une même image démarre dans les 3 configurations, vérifiées par la CI : production sans API (refus), démo (fichier), API (lecture HTTP, 500 si l'API tombe).
- ➕ Un changement de contrat casse à la fois l'API et le site à la compilation ou dans les tests.
- ➖ Toutes les pages du catalogue sont rendues à la demande : quelques millisecondes par page grâce au cache.
- ➖ Les paniers et favoris enregistrés avant cette version sont vidés (une seule fois).
- ➖ Le mode fichier dupliquait la logique de recherche de l'API (`file-catalog.ts`) : **retiré au S3-T08** (tests du site sur une fausse API en mémoire).
