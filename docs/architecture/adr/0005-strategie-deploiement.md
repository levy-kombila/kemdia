# ADR-0005 — Stratégie de déploiement : VPS Docker + Caddy, promotion d'image par digest

- **Statut** : Accepté
- **Date** : 2026-10-05

## Contexte

- Application conteneurisée (image `standalone` Next.js), un backend et PostgreSQL arriveront au Sprint 3.
- Budget de démarrage limité, besoin de maîtriser la localisation des données (loi gabonaise n°001/2011).
- Dépôt GitHub **privé sur plan gratuit** : pas d'Environments protégés ni de protection de branche.

## Options étudiées

| Option                              | +                                                                    | −                                                                                                 |
| ----------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Plateforme gérée (Vercel, Netlify…) | Zéro serveur                                                         | Dépendance forte, coûts à l'échelle, données hors de contrôle, backend NestJS à héberger ailleurs |
| Kubernetes géré                     | Très scalable                                                        | Disproportionné pour la phase 1, coûteux, complexe                                                |
| **VPS + Docker Compose + Caddy**    | Simple, peu coûteux, portable, même image partout, HTTPS automatique | Un serveur à maintenir (automatisé par scripts)                                                   |

## Décision

1. **Registre** : GitHub Container Registry (GHCR), images privées liées au dépôt.
2. **Build once, deploy many** : l'image est construite et scannée (Trivy) une fois dans la CI de `main`,
   étiquetée `sha-<commit>` ; la release ré-étiquette **la même image** en `vX.Y.Z`. Déploiement **par digest** (immuable).
3. **Environnements** : `staging` (automatique après chaque fusion dans `main`, protégé par mot de passe, non indexé)
   et `production` (déclenchée uniquement par un tag `vX.Y.Z` posé sur `main`, par le propriétaire du dépôt).
4. **Accès serveur** : utilisateur `deploy` avec clé SSH en _forced command_ — la CI ne peut exécuter que `deploy.sh`,
   qui valide strictement ses arguments ; empreinte du serveur épinglée (`known_hosts`). Le jeton du registre est éphémère et transmis par l'entrée standard.
5. **Fiabilité** : healthcheck Docker (`/api/health`), `compose up --wait`, test de fumée HTTP (version, page, en-têtes de sécurité),
   retour arrière automatique.
6. **Reverse proxy** : Caddy (HTTPS Let's Encrypt, HTTP/3, compression).
7. **Supply chain** : toutes les actions GitHub épinglées par SHA de commit, mises à jour par Dependabot.

## Conséquences

- Coût mensuel = un VPS. Migration future vers plusieurs serveurs ou Kubernetes possible sans changer l'image.
- Bref redémarrage (quelques secondes) à chaque déploiement : acceptable en phase 1 ; _blue/green_ envisageable au S7.
- Passage à GitHub Pro recommandé avant l'ouverture au public (protection de `main`, approbation de la production).
