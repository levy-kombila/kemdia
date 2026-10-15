# ADR-0030 — Démo du premier achat (page /demo, code DEMO10), CI allégée, versions 0.5.0

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Tâche** : S5-T08 (clôture du Sprint 5)
- **Complète** : [ADR-0013](0013-demo-render-api-neon.md) (démo Render), [ADR-0027](0027-notifications-signees-bac-a-sable.md) (bac à sable), [ADR-0029](0029-site-tunnel-commande-mes-commandes.md) (site branché)

## Contexte

Le jalon **v0.5.0** est « premier achat de bout en bout en bac à sable Mobile Money ». Depuis le S5-T07, tout fonctionne, mais
un testeur qui arrive sur la démo ne sait pas qu'il faut un compte, qu'un numéro fictif suffit, ni où se trouve le téléphone
simulé. GitHub Actions étant bloqué (facturation), chaque minute de CI compte aussi.

Choix du propriétaire (2026-10-15) :

| Question                    | Choix                                                                                    |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| Guider le testeur           | **Page `/demo` + bandeau** discret « Démo », là où le bac à sable existe seulement       |
| Code promo de démonstration | **Oui, créé à l'import de la démo** (`DEMO10`), jamais en préproduction ni en production |
| Versions                    | **API, contrat et site en 0.5.0** (le site, resté en 0.1.0 depuis le S1, est aligné)     |
| Alléger la CI               | **Oui, sans rien perdre** : PR de documentation seulement → jobs lourds sautés           |

## Décision

| Sujet             | Choix                                                                                                                                                                                                                                                                                       | Raison                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Page `/demo`      | Mode d'emploi en 4 étapes (compte, achat et `DEMO10`, Mobile Money simulé, facture) + « Bon à savoir » ; chiffres tirés des constantes du contrat (plafond provisoire, solde fictif, délais) ; non indexée                                                                                  | Un testeur réussit son premier achat sans aide                                                                |
| Bandeau           | « Site de démonstration : aucun vrai paiement. Tester un achat » au-dessus de l'en-tête, rendu par le serveur, hauteur fixe                                                                                                                                                                 | Personne ne croit payer pour de vrai ; aucun décalage de page (budget de performance)                         |
| Où                | Page et bandeau seulement si `sandboxPageEnabled()` : `APP_ENV` = `local`, `e2e` ou `demo` (liste autorisée : absent ou `production` → rien, 404)                                                                                                                                           | Même règle que le téléphone simulé                                                                            |
| `DEMO10`          | 10 %, 10 000 FCFA au plus, une fois par compte, non cumulable avec les promotions, sans fin ; constante `DEMO_COUPON` du contrat ; créé par l'import de démonstration (`ensureDemoCoupon`), identifiant et auteur « système » fixes ; **jamais modifié s'il existe** (activation, compteur) | Relançable à chaque redémarrage de la démo sans doublon ni écrasement d'un réglage d'administrateur           |
| Où `DEMO10` naît  | `demoCouponAllowed` : `APP_ENV=demo` ; ou `APP_ENV=local` hors `NODE_ENV=production` **et** base locale (`localhost`, `127.0.0.1`, `[::1]`, service `db`) ; jamais `staging` / `production`                                                                                                 | `APP_ENV` absent vaut `local` : un `db:seed` contre une vraie base distante ne crée pas de coupon (relecture) |
| CI allégée        | Job « Ce qui a changé » : sur une PR qui ne touche que `docs/**` ou `*.md`, les jobs base de données et bout en bout sont **sautés**, les images aussi (en cascade) ; `quality` tourne toujours ; push sur `main` et lancement manuel : tout tourne                                         | Un job sauté compte comme réussi (pas de PR bloquée) ; la publication et les déploiements ne changent pas     |
| Prudence de la CI | Anciens noms des fichiers renommés comptés ; nom avec un caractère de contrôle, API GitHub en panne, liste tronquée (> 2999 fichiers) → tout tourne                                                                                                                                         | Au moindre doute, on teste                                                                                    |
| Versions          | `@kemdia/api`, `@kemdia/contracts`, `@kemdia/web` en **0.5.0** ; contrat HTTP inchangé (1.13.0)                                                                                                                                                                                             | Jalon v0.5.0                                                                                                  |

## Conséquences

- ➕ Un testeur fait un achat complet seul, du panier à la facture, sans risque de confusion avec un vrai paiement.
- ➕ Une PR de documentation coûte quelques minutes de CI au lieu d'une demi-heure.
- ➖ `DEMO10` n'est pas inscrit au journal d'audit (créé par l'import, pas par un administrateur) ; supprimé par un administrateur de la démo, il revient au redémarrage suivant.
- ➖ L'allègement de la CI économise du temps, ce n'est pas une barrière : sans protection de branche, une PR peut modifier sa propre CI.
- ➖ Le texte de `/demo` parle de la démo Render (« la démo s'endort ») aussi sur le poste de développement.
