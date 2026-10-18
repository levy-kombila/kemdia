# ADR-0042 — Accueil : blocage du fil principal sous 300 ms

- **Statut** : Accepté
- **Date** : 2026-10-18
- **Tâche** : S7-T03
- **Complète** : S3-T08 (accueil chargé zone par zone, hydratation à la demande — cahier §5.2)

## Contexte

Le budget de performance mesure le **blocage du fil principal** de l'accueil (téléphone, 3G, processeur ralenti ×4,
médiane de 3 chargements à froid). Il était **indicatif** : 92 à 182 ms en CI jusqu'au S6-T06, puis **240 à 352 ms**
depuis le S6-T07, au-dessus des 300 ms visés.

Mesures de la tâche (poste de travail, ~1,5 fois plus lent que la CI, 5 à 7 chargements par variante) :

| Variante                                          | Blocage médian        |
| ------------------------------------------------- | --------------------- |
| Accueil actuel (`main`)                           | 385 – 436 ms          |
| Accueil d'avant le S6-T07 (même machine)          | 358 – 370 ms          |
| Page vide (en-tête, pied, fournisseurs, React)    | ~310 ms               |
| Page vide sans en-tête, pied ni fournisseurs      | ~150 ms               |
| Sans le menu des rayons                           | ~390 ms               |
| Sans bannière, ou sans ventes flash               | ~440 ms (aucun effet) |
| Police `display: optional`                        | ~440 ms (aucun effet) |
| Zones `<Suspense>` autour de l'en-tête et du pied | 640 – 670 ms (pire)   |
| **Liens « de masse » sans préchargement**         | **340 – 371 ms**      |

Constats : le S6-T07 ne touche pas l'accueil (le saut de la CI vient surtout des machines de CI) ; le coût est réparti
entre React, la mise en page commune et le contenu ; mais **Next.js préchargeait ~30 pages** dès le chargement (tous
les liens visibles : cartes, rayons, bannière, menu), soit ~75 ms de calcul et des données mobiles prises pendant que
la page devient interactive.

Choix du propriétaire (2026-10-18) : **alléger sans rien retirer** ; budget **bloquant avec marge** ; la carte produit
étant partagée, **les autres pages en profitent**.

## Décision

1. **Liens de masse sans préchargement automatique** (`prefetch={false}`) : carte produit, ronds et tuiles des rayons,
   bannière, ventes flash, titres de section, menu des rayons. La page suivante se charge au clic. Les quelques liens
   de l'en-tête et de la barre du bas (panier, compte, favoris) gardent le préchargement. Un test vérifie chaque fichier.
2. **Fenêtre « ville de livraison »** montée à sa **première ouverture** seulement : fermée, elle n'est plus rendue ni
   hydratée sur chaque page (liste des villes et des quartiers).
3. **Budget** : le blocage de l'accueil **fait échouer la PR au-delà de 350 ms** (médiane de 3 chargements) ; au-delà
   de 300 ms, avertissement. Les autres pages restent indicatives. Le résumé de la CI affiche le maximum.

## Conséquences

- Résultat en CI (3 passages) : **289, 247 et 314 ms** (médiane 289 ms), contre 197 à 352 ms sur `main` avant. Le gain
  du poste (~50 ms) est plus petit que l'irrégularité de la CI : l'objectif « durablement sous 300 ms » n'est **pas
  garanti** ; la limite bloquante de 350 ms protège contre les régressions.

- Au clic sur un produit ou un rayon, la page n'est pas déjà préchargée : un aller-retour de plus (~300 ms en 3G),
  contre ~30 pages de données mobiles économisées à chaque ouverture de l'accueil.
- Une régression de plus de 50 ms au-dessus du budget bloque désormais la PR.
- Pistes non retenues, à reprendre si le budget se rapproche de 350 ms : rangées du bas chargées au défilement (choix
  du propriétaire : non), moins de cartes sur l'accueil (choix de contenu du client).

## Alternatives écartées

- **Zones `<Suspense>` autour de l'en-tête et du pied** : mesurées deux fois plus lentes (le flux de la page change).
- **Police en `display: optional`** : aucun gain mesuré, et un affichage différent à la première visite.
- **Aucun lien préchargé** (en-tête compris) : même gain que les liens de masse seuls ; le panier et le compte gardent
  donc leur préchargement.
- **Budget bloquant à 300 ms** : échecs au hasard sur une CI chargée.
