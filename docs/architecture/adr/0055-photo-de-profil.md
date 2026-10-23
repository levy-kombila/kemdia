# ADR-0055 — Photo de profil (téléversée, initiales par défaut)

- **Statut** : Accepté
- **Date** : 2026-10-23
- **Tâche** : S7.5-T08
- **Complète** : [ADR-0035](0035-photos-produits-vendeurs.md) (réencodage des photos),
  [ADR-0047](0047-donnees-personnelles-apdpvp.md) (copie et effacement des données)

## Contexte

Le compte n'avait pas de photo : l'en-tête montrait une icône, « Mon compte » la première lettre du prénom.

Choix du 2026-10-23 : le propriétaire a demandé de **retenir les options recommandées sans les lui reposer**. Elles
sont donc retenues ici et listées pour qu'il les valide à la lecture de la PR :

| Question             | Choix retenu (recommandé)                                                               |
| -------------------- | --------------------------------------------------------------------------------------- |
| Qui voit la photo    | **Seulement le titulaire du compte** (en-tête, « Mon compte ») : pas de modération      |
| Sans photo           | **Initiales** (prénom + nom) sur une **couleur propre à la personne**, lisible en blanc |
| Format gardé         | **Carré de 256 px recadré au centre**, WebP **sans métadonnées**                        |
| Fichiers acceptés    | JPEG, PNG ou WebP, **5 Mo** au plus, **200 px** au moins de chaque côté                 |
| Effacement du compte | **La photo part avec le compte** ; la copie des données indique sa présence et sa date  |

## Décision

1. **Données** (migration `20261023170000_photo_profil`) : `identity.account_avatars` (photo en BYTEA, 256 Ko au plus,
   empreinte) et `identity.accounts.avatar_version` (16 premiers caractères de l'empreinte). Photo et version changent
   dans la même transaction.
2. **API** (`/api/v1/auth/avatar`, session obligatoire, toujours la photo du compte connecté — aucun identifiant dans
   l'adresse) :
   - `POST` (corps = le fichier) : format reconnu par les premiers octets ET par le décodeur ; 40 mégapixels au plus ;
     première image seulement ; orientation appliquée ; carré de 256 px ; WebP réencodé sans aucune métadonnée ; deux
     recadrages à la fois au plus, 15 s au plus ; 10 envois par minute et par compte ;
   - `GET` : la photo, `Cache-Control: private, no-cache`, `ETag` (304) ;
   - `DELETE` : retrait (les initiales reviennent).
     La version est dans `AccountView.avatar` (session, connexion).
3. **Site** : relais `/compte/photo` (GET/POST/DELETE) avec le cookie de session et l'adresse du visiteur ; l'adresse
   de la photo contient sa version (`?v=…`), gardée par le navigateur du titulaire seulement (`private, immutable`) ;
   la mémoire des sessions du site est oubliée après un changement (l'en-tête suit tout de suite). Les requêtes qui
   modifient passent par le contrôle d'origine du site. Composants `Avatar` (photo ou initiales) et `AvatarEditor`
   (« Ajouter / Changer la photo », « Retirer »), photo réduite dans le navigateur avant l'envoi.
4. **Données personnelles** : effacée avec le compte (photo et version) ; la copie des données indique
   `photoDeProfil: { presente, depuis }`.
5. **Contrat 2.4.0** : routes `/auth/avatar`, champ `avatar` de `AccountView`, codes `PHOTO_INVALIDE` et
   `PHOTO_ABSENTE`, constantes `AVATAR_LIMITS`.

## Conséquences

- Chacun personnalise son compte sans que l'équipe ait à modérer : la photo n'est jamais montrée à quelqu'un d'autre.
- Montrer la photo ailleurs (avis, service client, boutique) demandera une modération : nouvelle décision à prendre.
- La photo est dans PostgreSQL (comme celles des produits) : à déplacer vers un stockage objet avec elles plus tard.

## Alternatives écartées

- **Photo publique** (avis, page de la boutique) : demanderait une modération (photos inappropriées).
- **Fichier gardé tel quel** : garderait la position GPS et l'appareil ; le réencodage les retire.
- **Avatar généré (motif)** : moins reconnaissable que les initiales.
