# ADR-0037 — Espace vendeur sur le site (`/vendeur`)

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Tâche** : S6-T06
- **Complète** : [ADR-0032](0032-boutiques-vendeurs.md) (boutiques), [ADR-0033](0033-produits-vendeurs-moderation.md)
  (produits), [ADR-0035](0035-photos-produits-vendeurs.md) (photos), [ADR-0036](0036-ecrans-equipe.md) (écrans de l'équipe)

## Contexte

Depuis le S6-T05, l'équipe valide boutiques et produits à l'écran, mais un vendeur ne peut toujours rien faire sans outil
technique : la page `/vendre` n'avait qu'un formulaire de démonstration qui n'envoyait rien, et elle annonçait une commission
« de 8 % à 14 % » alors que la commission est une question ouverte au client (n° 3). L'API, elle, sait tout faire depuis le
S6-T04 (boutique, produits, variantes, photos).

Choix du propriétaire (2026-10-16) :

| Question               | Choix                                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| Demande de boutique    | **Vraie demande dans `/vendeur`** ; `/vendre` reste la présentation et y mène ; le faux formulaire disparaît |
| Photos de téléphone    | **Réduites dans le navigateur** avant l'envoi (3 à 8 Mo → quelques centaines de Ko)                          |
| Commission sur /vendre | **Chiffres retirés** : « barème communiqué avant l'ouverture »                                               |
| Adresse                | **`/vendeur`**, lien « Mon espace vendeur » dans « Mon compte »                                              |

## Décision

| Sujet              | Choix                                                                                                                                                                                                                                                                    | Raison                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Pages              | `/vendeur` (selon la boutique : demande, demande en cours, refus + nouvelle demande, suspension, ou tableau de bord), `/vendeur/produits` (par statut), `/vendeur/produits/nouveau`, `/vendeur/produits/{id}` (photos, prix et stock, fiche, retrait de la vente)        | Tout le parcours d'un vendeur, depuis son téléphone                                    |
| Garde côté site    | `lib/vendor/vendor.ts` : connecté (tout compte peut demander une boutique) ; pages de produits seulement avec une boutique **active**, sinon l'accueil explique où en est la demande. **L'API reste juge** (rôle vendeur + boutique active + produit de SA boutique)     | Pas de page vide ; la sécurité ne dépend pas du site                                   |
| Adaptateur         | `lib/vendor/api-vendor.ts` (`server-only`) : mêmes règles que celui de l'équipe ; identifiants vérifiés (UUID) avant toute adresse ; l'explication de l'API n'est reprise que pour un champ mal rempli (`PRODUIT_INVALIDE`, `BOUTIQUE_INVALIDE`), 300 caractères au plus | Aucun chemin fabriqué ; messages utiles sans fuite                                     |
| Formulaires        | Demande, création et fiche : composants avec JavaScript (erreurs par champ, variantes ajoutées à la volée), règles partagées navigateur / action serveur (`lib/vendor/forms.ts`) ; prix et stock, photo principale, retraits : **formulaires HTML simples**              | Messages immédiats là où ils aident ; zéro JavaScript ailleurs                         |
| Montants           | FCFA entiers ; espaces acceptés ; le point **seulement** comme séparateur de milliers (« 12.50 » refusé, jamais lu 1 250)                                                                                                                                                | Un prix mal tapé ne doit jamais être multiplié par 100                                 |
| Stock              | Envoyé seulement s'il a changé, avec le stock lu (`previousStock`) : une commande arrivée entre-temps n'est jamais écrasée (`STOCK_MODIFIE`)                                                                                                                             | Règle du S6-T02                                                                        |
| Photos : réduction | Dans le navigateur (`createImageBitmap` + canevas) : 1 600 px au plus, JPEG qualité 85, sens appliqué, fond blanc ; une petite photo (≤ 1 600 px, ≤ 1,5 Mo) part telle quelle ; refus local sous 200 px                                                                  | Rapide en 3G, plus de refus « trop lourde » ; l'API réencode toujours sans métadonnées |
| Photos : envoi     | **Route** `POST /vendeur/produits/{id}/photos` (corps = le fichier) : session vérifiée **avant** de lire le corps, 4 envois à la fois par serveur, 5 Mo lus en flux au plus, type lu dans les octets ; Caddy borne tout corps à 6 Mo ; délai de 35 s vers l'API          | Pas de mémoire consommée par un faux cookie (relecture) ; pas de multipart à analyser  |
| Photos : aperçu    | Relais `/vendeur/produits/{id}/photos/{photo}` : jeton présenté à l'API, WebP vérifié, `private, no-store`, 404 uniforme ; photo principale choisie par l'ordre **relu dans l'API** ; retrait replié derrière une confirmation                                           | Une photo en attente n'est jamais publique ; aucune photo d'un autre produit           |
| `/vendre`          | Faux formulaire et `lib/vendor-lead.ts` supprimés ; « Devenir vendeur » mène à `/vendeur` ; aucun taux de commission annoncé                                                                                                                                             | Pas de demande perdue ; rien de promis avant la réponse du client                      |
| Indexation         | `noindex` sur l'espace ; `/vendeur` ajouté à `robots.txt` (comme `/compte` : rien de secret)                                                                                                                                                                             |                                                                                        |
| Données de test    | `e2e/fixtures/vendeur-e2e.sql` (et `equipe-e2e.sql`) : garde-fou `kemdia.e2e`, **arrêt à la première erreur même sans `-v ON_ERROR_STOP=1`**, tout dans une transaction                                                                                                  | Lancé par erreur, il n'écrit rien (prouvé)                                             |

Le contrat de l'API ne change pas (1.17.0), ni la base.

## Options écartées

- **Photo envoyée telle quelle** : lente en 3G, souvent refusée (> 5 Mo).
- **Envoi par une action serveur** : corps limité à 1 Mo par défaut, formulaire multipart à analyser en mémoire.
- **Demande de boutique sur `/vendre`** : page publique de présentation, mise en cache ; un formulaire connecté y aurait mélangé deux rôles.
- **Ordre des photos reçu du navigateur** : il suffit de choisir la principale ; l'ordre complet est relu dans l'API.

## Conséquences

- ➕ Parcours complet à l'écran : demande → validation (équipe) → produit, photos, prix et stock → validation → en ligne.
- ➕ Pages publiques inchangées (169 à 172 Ko de JavaScript) ; pages vendeur ≈ fiche produit, sans Zod.
- ➖ Le prix et la mise en vente d'une variante : la dernière écriture l'emporte entre deux onglets (le stock, lui, est protégé).
- ➖ Une petite photo envoyée telle quelle garde ses métadonnées jusqu'à l'API, qui les retire (rien n'est publié).
- ➖ Pas encore de nouvelle variante sur un produit existant (l'API ne le permet pas) : recréer le produit.
- 🔜 KYC (BR-024), commandes vendeur (BR-013), versements et commission (BR-020, réponse du client attendue).
