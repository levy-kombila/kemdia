# ADR-0022 — Écran de réveil de la démo et retrait des colonnes en deux temps

- **Statut** : Accepté
- **Date** : 2026-10-09
- **Tâche** : S4-T08
- **Complète** : [ADR-0013](0013-demo-render-api-neon.md) (démo Render + Neon), [ADR-0017](0017-connexion-sessions.md) (blocage par identifiant), [ADR-0021](0021-csrf-csp-limites.md) (pages rendues à la demande)

## Contexte

1. **Démo gratuite** : le site et l'API s'endorment après 15 minutes sans visite. Au réveil, l'API met jusqu'à une minute
   à répondre ; le premier visiteur voyait une **page blanche** (le site attend l'API jusqu'à `CATALOG_TIMEOUT_MS=90000`).
2. **Dette du S4-T03** : les colonnes `accounts.failed_logins` et `accounts.locked_until` ne servent plus (le blocage est dans
   `login_guards`). Le cahier impose « ajouter d'abord, supprimer plus tard » : une migration ne doit pas casser la version
   précédente de l'API, encore en ligne pendant un déploiement.

Choix du propriétaire (2026-10-09) : **écran d'attente immédiat** sans changer de réglage Render ; retrait des colonnes **en deux temps**.

## Décision

### Écran « La boutique se réveille » — démo seulement

| Sujet        | Choix                                                                                                                                                                                                                | Raison                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Mécanisme    | Avec `APP_ENV=demo`, le layout entoure l'en-tête et la page de `<Suspense>` : en-tête de réserve + `WakeUpNotice` envoyés tout de suite (streaming)                                                                  | Le visiteur voit le site en ~0,3 s au lieu d'une page blanche ; aucun réglage Render                                         |
| Message      | Rien pendant 2 s, puis « La boutique se réveille… » (`role="status"`, animation coupée si « mouvement réduit »)                                                                                                      | Invisible quand l'API est éveillée                                                                                           |
| En-tête      | Même structure, compte remplacé par un emplacement réservé (`aria-hidden`, rien de cliquable), menu vide                                                                                                             | Pas de faux « Se connecter » pour un client connecté, pas de saut de mise en page vertical                                   |
| Hors démo    | **Rendu bloquant inchangé**                                                                                                                                                                                          | En streaming, le statut 200 part avant que la page sache qu'elle est introuvable (404), en erreur (500) ou à rediriger (307) |
| Réponses 502 | Pendant le démarrage de l'API, Render répond 502/503/504 au lieu d'attendre : le site (catalogue et réveil au démarrage) réessaie toutes les 3 s, dans la limite de `CATALOG_TIMEOUT_MS` / 90 s ; **démo seulement** | Sans cela, l'écran de réveil laissait vite place à la page d'erreur (constaté le 2026-10-09)                                 |
| Indexation   | `robots.txt` de la démo : `Disallow: /`                                                                                                                                                                              | Données fictives, et une page introuvable y répond 200 (marquée `noindex` par Next.js)                                       |

### Colonnes obsolètes — deux temps

| Étape | Quand      | Contenu                                                                                                 |
| ----- | ---------- | ------------------------------------------------------------------------------------------------------- |
| 1     | **S4-T08** | Champs `@ignore` dans le schéma Prisma : le code ne lit ni n'écrit plus ces colonnes ; aucune migration |
| 2     | **S5-T01** | Migration `DROP COLUMN` (+ contrainte `accounts_failed_logins_check`), une fois l'étape 1 en ligne      |

## Options écartées

- **Écran de réveil partout** (`app/loading.tsx`) : essayé, puis retiré après la relecture — les vrais codes 404, 500 et 307 étaient
  perdus en staging et en production (moteurs de recherche, supervision, redirection de `/connexion` devenue côté navigateur).
- **Délai court + page qui se recharge** : demandait de baisser `CATALOG_TIMEOUT_MS` sur Render.
- **Page d'attente servie par `proxy.ts` (503 + `Retry-After`)** : codes justes, mais le proxy devrait connaître l'état de l'API
  (variable globale déconseillée par la documentation de Next.js pour le proxy).
- **`DROP COLUMN` tout de suite** : quelques secondes d'erreurs 500 sur la connexion pendant chaque déploiement de la démo.

## Conséquences

- ➕ Plus de page blanche au réveil de la démo ; rien ne change ailleurs (vérifié : 404 et 307 réels hors démo, tests de bout en bout).
- ➕ Aucune erreur pendant le déploiement qui retire les colonnes du code.
- ➖ Sur la démo, une page introuvable répond 200 (avec `noindex`) et une redirection de page se fait côté navigateur.
- ➖ Les colonnes restent en base jusqu'au S5-T01 (à ne pas oublier : ligne ajoutée au planning).
