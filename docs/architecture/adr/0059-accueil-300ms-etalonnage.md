# ADR-0059 — Accueil durablement sous 300 ms : moins d'hydratation et processeur étalonné

- **Statut** : Accepté
- **Date** : 2026-10-24
- **Tâche** : S8-T04 (dette S7-T03 : « durablement sous 300 ms » non garanti)
- **Complète** : [ADR-0042](0042-accueil-blocage.md) (accueil sous 300 ms, liens de masse sans préchargement)

## Contexte

Le budget mesure le **blocage du fil principal** de l'accueil (téléphone, 3G, cache vide, processeur ralenti ×4). Depuis
le S7-T03, la PR échoue au-delà de 350 ms. Sur `main`, pour un code qui ne change pas l'accueil, la CI mesurait
pourtant **82 à 351 ms** (8 derniers passages), et la PR #95 a échoué une fois à 351 ms.

Mesures de la tâche :

1. **La vitesse de la machine de CI explique presque tout.** Un petit calcul fixe (objets, chaînes, JSON) a été
   chronométré dans le navigateur au début du test (« étalon »). Même code, ×4 fixe :

   | Étalon (machine de CI) | Blocage de l'accueil (médiane de 5) | Chargements  |
   | ---------------------- | ----------------------------------- | ------------ |
   | 18,8 ms                | **157 ms**                          | 146 à 166 ms |
   | 33,4 ms                | **293 ms**                          | 276 à 310 ms |
   | ~40 ms                 | **358 ms**                          | 342 à 380 ms |

   Le blocage suit la vitesse de la machine (≈ 8,5 × l'étalon) ; d'un chargement à l'autre sur une même machine, il
   varie peu. Un ralentissement **fixe** simule donc un téléphone plus ou moins rapide selon la machine du jour. Les
   machines lentes sont apparues récemment (premiers échecs le 2026-10-23, peu après le changement d'image des
   serveurs de GitHub annoncé pour le 2026-10-19).

2. **Ce qui coûte encore sur l'accueil** (poste de travail, profils Chrome, comparaisons A/B alternées) : la page vide
   (React, Next.js, en-tête, pied de page) fait ~60 % du blocage ; le haut de l'accueil et les rangées du bas le
   reste. À l'ouverture, React rend interactifs ~1 150 composants, dont **~25 photos** (`<Image>` de Next.js est un
   composant « client ») et le **pied de page** (11 liens, dont « Signaler un problème »), pourtant hors écran.

Choix du 2026-10-24 : à la demande du propriétaire, les **options recommandées** sont retenues sans lui être
reposées ; elles sont listées ci-dessous et dans la PR.

## Décision

1. **Photos en simple `<img>`** : `ProductImage` calcule les adresses et tailles avec `getImageProps` (mêmes
   adresses, même `srcset`, même optimiseur, même chargement différé) et rend une balise `<img>` sans composant à
   hydrater. Une image à précharger (`preload`) l'est toujours, par `<link rel="preload">` dans l'en-tête. Toutes les
   pages en profitent (cartes, rayons, bannière, galerie, panier).
2. **Pied de page rendu interactif à l'approche** : il est enveloppé dans `HydrateWhenVisible` (déplacé dans
   `components/ui`, il sert à l'accueil et au pied de page). Avant cela, ses liens restent de simples liens. Quand la
   zone devient interactive alors qu'un de ses liens a le focus (Tab), le focus est rendu au lien équivalent.
3. **Processeur étalonné** dans le test de performance : le ralentissement vaut `4 × 20 ms / étalon`, borné de ×2 à
   ×8 ; l'étalon est le **meilleur de 9 passages** (le bruit d'une machine partagée ne fait qu'ajouter du temps). La
   référence de **20 ms** est la vitesse des machines sur lesquelles le budget a été fixé et tenu (S2 à S6 : accueil
   92 à 182 ms ; 157 ms ici à 18,8 ms). Ralentissement, étalon et chaque chargement sont affichés dans le résumé de la
   CI et ses annotations ; une machine hors des bornes est signalée (« mesures moins comparables »).
4. **Accueil : médiane de 5 chargements** (3 pour les autres pages) et blocage **bloquant au-delà de 300 ms** (au
   lieu de 350 ms). Les autres pages restent indicatives.

## Conséquences

- Gain mesuré sur le poste (A/B alternés, médianes) : photos −34 ms, pied de page −26 ms, soit ~12 % du blocage de
  l'accueil ; JavaScript transféré inchangé (172 Ko).
- Avec l'étalonnage, la CI a mesuré l'accueil à **112 ms** sur une machine lente (étalon 33,1 ms, ×2,42 ; chargements
  105 à 142 ms), contre 293 ms à ×4 fixe sur une machine semblable. Sur une machine rapide, ~160 ms sont attendus
  (157 ms mesurés à ×4 pour 18,8 ms). La correction n'est pas parfaitement proportionnelle (le blocage ne compte que
  la part des tâches au-delà de 50 ms), mais l'écart entre machines passe de 82–358 ms à ~110–160 ms : la limite
  bloquante de 300 ms garde près du double de marge.
- Le « téléphone » simulé est désormais constant ; les mesures d'avant le S8-T04 (×4 fixe) ne sont pas directement
  comparables à celles d'après sur une machine lente.

### Risques acceptés

- **Borne basse ×2** : sur une machine plus de deux fois plus lente que la référence (étalon > 40 ms), le téléphone
  simulé redevient plus lent que prévu et le blocage peut grimper. Une relance de la CI suffit ; si cela se répète, la
  référence ou la borne seront revues.
- **L'étalon ne mesure que le calcul JavaScript** ; mise en page et dessin suivent la même vitesse de processeur, ce
  que confirment les mesures ci-dessus, mais une machine au disque ou à la mémoire anormalement lents ne serait pas
  corrigée.
- **Photos sans composant `<Image>`** : plus de flou d'attente possible ni d'événement de chargement côté React ;
  aucune page n'en utilisait. Le composant n'est plus utilisé dans le site.
- **Pied de page avant hydratation** : un clic avant que le pied ne soit rendu interactif ouvre la page par un
  chargement complet (lien ordinaire) au lieu d'une navigation côté client ; le bouton « Signaler un problème » est un
  lien et fonctionne de même. Sur une page courte où le pied est visible dès l'ouverture, il est rendu interactif
  juste après le chargement.
- **« Signaler un problème » après une navigation côté client** (relecture de sécurité, basse) : tant que le pied n'a
  pas été rendu interactif, son lien garde le chemin de la première page ouverte. Il est corrigé à l'approche du pied
  (400 px), donc avant qu'on puisse le toucher ; seul le chemin part, jamais les paramètres de l'adresse.
- **Étalon ralenti par une machine voisine chargée** (relecture, basse) : le ralentissement baisse et le test devient
  plus tolérant, au plus deux fois (borne ×2) ; le meilleur de 9 passages limite cet effet.
- **Budget modifiable par une PR** (relecture, info) : référence, bornes et limite sont dans le dépôt, comme avant ;
  tout changement passe par une PR relue par le propriétaire (pas de fichier CODEOWNERS pour un seul développeur).

## Alternatives écartées

- **Zones `<Suspense>` autour des sections du haut** (bannière, rayons, ventes flash) : mesurées **+40 à +50 ms**
  (deux comparaisons A/B), comme l'en-tête et le pied à l'ADR-0042.
- **Rangées du bas sans streaming** (données lues avant d'envoyer la page) : aucun gain, page envoyée plus tard.
- **Rendu interactif des rangées du bas en transition (`startTransition`)** : +40 ms ; **à l'entrée dans l'écran
  seulement** (sans les 400 px d'avance) : aucun gain.
- **Budget bloquant à 300 ms sans étalonnage** : échecs au hasard sur les machines lentes (293 et 358 ms mesurés).
- **Ralentissement fixe plus faible** (×3) : rendrait le test trop indulgent sur les machines rapides.
- **Moins de cartes sur l'accueil, rangées chargées au défilement** : choix de contenu du client et du propriétaire
  (ADR-0042), non repris.
