# ADR-0001 — Réécriture complète plutôt que correction de l'ancien projet

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

La première version (Django 5.1, « EcomKWD ») a fait l'objet de 4 audits de sécurité successifs le 11/09/2026.
Résultat : **45 failles** (6 critiques, 16 hautes, 18 moyennes, 5 basses) et **0 corrigée** entre les itérations —
chaque audit en a révélé de nouvelles (23 → 28 → 35 → 45).

Les failles touchent le cœur du métier, pas la périphérie :

- paiement contournable (CRIT-01), coupons appliqués deux fois ou réutilisables à l'infini (HIGH-05, HIGH-06) ;
- élévation de privilèges vers superutilisateur (CRIT-06), accès aux factures d'autrui (HIGH-01) ;
- secrets et dumps de base de données dans l'historique Git (CRIT-02, CRIT-03, CRIT-05) ;
- 108 CVE dans les dépendances (HIGH-07).

Le porteur du projet indique ne pas maîtriser entièrement le code existant.

## Décision

Repartir sur une base neuve, en **réutilisant** ce qui a de la valeur :

- l'identité visuelle et les maquettes (couleurs, organisation de l'accueil, mega-menu, cartes produits) ;
- l'arborescence des catégories, les images produits, les barèmes de livraison du Gabon ;
- la connaissance métier (FCFA, Mobile Money, livraison par ville/quartier, vendeurs).

Le code Python, les templates et la base de données ne sont **pas** repris.

## Conséquences

- ➕ Sécurité intégrée dès la conception (« secure by design »), tests et CI dès le premier jour.
- ➕ Code compris ligne à ligne par l'équipe, documenté au fil de l'eau.
- ➖ Délai avant de retrouver toutes les fonctionnalités (vendeurs, livreurs, back-office).
- ⚠️ Les secrets présents dans l'ancien dépôt doivent être **considérés comme compromis et changés**
  (mot de passe PostgreSQL, SECRET_KEY, identifiants SMTP, clés Stripe/Mobile Money le cas échéant),
  et l'ancien dépôt rendu privé ou archivé.
