# Workflow Git et livraison continue

## Branches

- `main` : toujours stable et déployable. Protégée : on n'y pousse jamais directement.
- `feature/S2-T03-liste-envies`, `fix/S2-T10-prix-mobile`, `docs/…` : une branche par tâche du planning.

## Cycle d'une tâche

1. `git switch main && git pull`
2. `git switch -c feature/S2-T03-liste-envies`
3. Coder + tests. Avant de pousser : `pnpm lint && pnpm typecheck && pnpm test`
4. Commits au format **Conventional Commits** :
   - `feat(panier): ajout du bouton vider le panier (S1-T09)`
   - `fix(produit): quantité bornée au stock`
   - `test(livraison): cas Franceville`
   - `docs(rapport): rapport S2`
   - `ci: ajout de Playwright`
5. `git push -u origin feature/S2-T03-liste-envies` puis ouvrir une **Pull Request** (le modèle s'affiche).
6. La CI doit être entièrement verte. Relecture, puis **Squash and merge**.
7. Mettre à jour le rapport de sprint et, si besoin, le cahier d'architecture **dans la même PR**.

## Versions

À chaque fin de sprint : tag `v0.<sprint>.0` (ex. `v0.1.0` pour S1) et note de version reprenant le rapport.
