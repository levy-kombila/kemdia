# Rapport — S9-T02 : vignettes des produits dans les listes de l'équipe

|                                                 |                                                    |
| ----------------------------------------------- | -------------------------------------------------- |
| **Date**                                        | 2026-10-28                                         |
| **Sprint / tâches**                             | S9 — S9-T02 (retour du propriétaire)               |
| **Version**                                     | v0.9.0 → (v1.0.0 au lancement) ; contrat **2.9.0** |
| **Sections du cahier d'architecture modifiées** | §3.40 (nouvelle) — version 4.37                    |

## 1. Résumé

Dans « Fiches produits » et « Avis clients », il fallait ouvrir chaque produit pour voir sa photo. Chaque ligne montre
maintenant une vignette à gauche :

```
[photo] Pc lenovo  (En ligne)              Lenovo · 1 offre(s) en ligne · dès 230 000 FCFA   >
[photo] ★★★★☆ Robe pagne — Awa · 28/10      [Publier] [Refuser…]
```

## 2. Fonctionnalités livrées

| Élément         | Ce qui change                                                                           | Où                                                   |
| --------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Fiches produits | Vignette de la première photo sur chaque ligne                                          | `app/equipe/fiches/page.tsx`                         |
| Avis clients    | Vignette du produit noté sur chaque avis                                                | `app/equipe/avis/page.tsx`                           |
| Composant       | `ProductThumb` et `staffThumbSrc` (adresse toujours construite et vérifiée par le site) | `components/staff/ProductThumb.tsx`                  |
| API             | `AdminReview.listing.image` : première photo de la fiche ; contrat **2.9.0**            | `catalog/infrastructure/listing-ratings.ts`, contrat |
| Tests           | 2 tests du composant, 1 vérification d'intégration (photo renvoyée dans la file)        | `ProductThumb.test.tsx`, `reviews.int.test.ts`       |

La file de modération et « Mes produits » du vendeur avaient déjà leurs vignettes. Aucune migration.

## 3. Décisions techniques

Choix du 2026-10-28 : options recommandées retenues sans t'être reposées :

- fiche **publiée** → vignette publique de 480 px (petite, comme sur le site) ;
- fiche pas encore publiée → **relais de l'équipe** (rôle et double authentification vérifiés à chaque photo) ;
- aucune adresse reçue n'est utilisée telle quelle : seuls les chemins `/images/…` du site sont acceptés.

Décision complète : [ADR-0066](../architecture/adr/0066-vignettes-listes-equipe.md).

## 4. Sécurité

### Relecture indépendante (agent séparé, avant la PR) : 0 critique, 0 haute, 0 moyenne, 2 basses, 2 infos

| Problème relevé                                                                                          | Correction                                                                    |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Basse : photo de vendeur demandée au relais public même si la fiche n'est pas publiée (image cassée)     | Photo de vendeur sans relais possible → « sans photo » (testé)                |
| Basse : chaque vignette passait par le relais de l'équipe en grande taille (limite de 120 appels/minute) | Fiche publiée → vignette publique de 480 px ; relais seulement si non publiée |
| Info : accès bien protégés, chemins vérifiés, rien d'exécutable                                          | Tests ajoutés : `javascript:`, `//autre-site`, `..`                           |

## 5. Qualité

- Format et lint sur tout le dépôt, typecheck et build : ✓.
- Tests unitaires : API **670** ✓, site **505** ✓ (+2), contrat **34** ✓.
- Intégration sur une base PostgreSQL neuve : **262** ✓ (vérification de la photo ajoutée).
- `pnpm audit --audit-level high --prod` sans faille ; Gitleaks v8.30.1 ✓ ; bout en bout, Semgrep, CodeQL et ZAP : par
  la CI.

## 6. Captures d'écran

Visible sur la démo après le déploiement : Équipe → Fiches produits, et Équipe → Avis clients.

## 7. Limites connues / dette technique

- Fiche pas encore publiée : grande photo par le relais (cas rare).
- Avis d'une fiche retirée entre-temps : vignette vide.

## 8. Prochaines étapes

- Aucune migration. Après la fusion, attendre « Déploiement DÉMO (Render) ».
- **S9-T03 (recommandé)** : espace de l'équipe et des vendeurs au niveau des back-offices de référence.
