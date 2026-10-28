# ADR-0066 — Vignettes des produits dans les listes de l'équipe

- **Statut** : Accepté
- **Date** : 2026-10-28
- **Tâche** : S9-T02 (retour du propriétaire)
- **Complète** : [ADR-0035](0035-photos-produits-vendeurs.md) (photos des vendeurs), [ADR-0036](0036-ecrans-equipe.md)

## Contexte

Dans « Fiches produits » et « Avis clients », l'équipe devait ouvrir chaque produit pour voir sa photo. La file de
modération et la liste des produits du vendeur avaient déjà une vignette.

## Décision

1. Vignette (première photo) à gauche de chaque ligne de **Fiches produits** et de la file des **Avis clients**,
   composant commun `ProductThumb` ; « sans photo » sinon.
2. Adresse construite par le site (`staffThumbSrc`) : fiche **publiée** → vignette publique de 480 px (celle du
   site) ; fiche pas encore publiée → **relais de l'équipe** (rôle et double authentification vérifiés à chaque
   photo) ; photo du catalogue Kemdia → chemin public ; tout autre chemin (autre site, `..`, `javascript:`) → rien.
3. API : `AdminReview.listing.image` (première photo de la fiche) ; contrat **2.9.0** (champ ajouté).

Choix du 2026-10-28 : options recommandées retenues sans être reposées (ta demande du 2026-10-23).

## Conséquences

- L'équipe reconnaît un produit d'un coup d'œil ; la plupart des vignettes sont petites et ne comptent pas dans les
  limites de l'équipe. Aucune migration.

### Risques acceptés

- Fiche pas encore publiée : la vignette passe par le relais (grande photo, un appel compté dans la limite de
  l'équipe) ; une page affiche au plus quelques fiches non publiées.
- Avis d'une fiche retirée entre-temps : la vignette peut rester vide (image refusée par le site).

## Alternatives écartées

- **Taille « petite » ajoutée au relais de l'équipe** : changement de l'API pour un cas rare (fiches non publiées).
