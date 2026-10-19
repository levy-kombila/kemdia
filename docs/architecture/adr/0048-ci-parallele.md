# ADR-0048 — CI plus rapide : jobs en parallèle, déploiement et production conditionnés à une CI verte

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Tâche** : S7.5-T01
- **Complète** : [ADR-0030](0030-demo-premier-achat-ci-allegee.md) (CI allégée), [ADR-0046](0046-test-intrusion-zap-asvs.md) (ZAP)

## Contexte

À la fin du S7, un passage réussi de la CI d'une PR durait **environ 13 minutes**, et un échec obligeait à tout
relancer. Pour la PR #80, un lint oublié a ajouté environ 30 minutes. Les mesures sur la PR #80 :

| Job                                             | Durée    | Démarrait après                      |
| ----------------------------------------------- | -------- | ------------------------------------ |
| Lint · Types · Tests · Build                    | 4 min 45 | —                                    |
| Bout en bout et performance                     | 4 min 33 | Lint · Types · Tests · Build         |
| Pile serveur                                    | 6 min 10 | Lint · Types · Tests · Build         |
| Image Docker du site                            | 3 min 53 | Bout en bout (donc ~9 min d'attente) |
| ZAP passif — site (4 rôles, l'un après l'autre) | 9 min 40 | —                                    |

Les jobs « bout en bout », « pile serveur » et « images » n'utilisent **rien** de ce que produit le job de qualité :
chacun réinstalle et reconstruit tout. L'attente ne servait qu'à ne pas publier d'image si un test échouait.

Choix du propriétaire (2026-10-19) : l'image Docker n'attend plus les tests de bout en bout ; **seul le déploiement**
attend que tout soit vert.

## Décision

1. **Tout démarre en même temps.** Bout en bout, pile serveur, image du site et image de l'API ne dépendent plus que du
   job « Ce qui a changé ». Une PR qui ne touche que de la documentation saute toujours ces jobs (ADR-0030).
2. **Les déploiements attendent tout.** Les jobs « Déploiement STAGING » et « Déploiement DÉMO (Render) » exigent :
   qualité, base, bout en bout, pile serveur et les deux images. Avant, ils n'attendaient que les images, et la pile
   serveur n'était pas une condition.
3. **La production attend une CI verte.** Sur `main`, les images sont publiées pendant que les tests tournent encore.
   « L'image existe » ne prouve donc plus que « la CI a réussi ». Avant de promouvoir quoi que ce soit, `release.yml`
   vérifie que la CI/CD du commit taggé est **terminée et verte** (attente de 30 min au plus). Sinon il s'arrête.
4. **Scan ZAP passif : les 4 rôles en même temps.** Ce sont 4 processus ZAP, chacun avec son propre port de proxy (ZAP
   l'ouvre même en ligne de commande) et son dossier de travail neuf. Les rapports et annotations sont lus ensuite, un
   rôle après l'autre, comme avant. Le scan **actif** du dimanche reste séquentiel, pour ne pas surcharger la pile.

## Conséquences

- **Positives** :
  - Le chemin le plus long passe d'environ 13 min à environ 6–7 min, avec la pile serveur et ZAP en tête.
  - Un passage rouge est connu plus tôt, puisque chaque job signale son échec sans attendre les autres.
  - Les déploiements sont **plus** stricts qu'avant, car la pile serveur devient une condition.
- **Négatives** :
  - Sur `main`, une image peut être publiée dans GHCR et Docker Hub pour un commit dont les tests échouent ensuite.
    Elle n'est alors déployée nulle part : staging et démo attendent tout, et la production vérifie la CI. Elle reste
    seulement visible dans les registres sous l'étiquette `sha-…`.
  - Quand le job de qualité échoue, les autres jobs tournent quand même jusqu'au bout. Il y a plus de minutes de runner
    consommées, mais elles sont gratuites pour un dépôt public. Un nouveau push annule l'ancien passage d'une PR.
  - Environ 17 jobs démarrent ensemble, sous la limite de 20 runners simultanés d'un compte gratuit.
- **Alternatives écartées** :
  - Garder l'attente : environ 4 min de plus à chaque passage, refusé par le propriétaire.
  - Publier les images seulement dans le job de déploiement : cela demande de reconstruire ou de transférer l'image
    entre jobs, et c'est plus complexe pour un gain nul en sécurité, la production vérifiant déjà la CI.
  - Raccourcir l'exploration de ZAP : la couverture du test d'intrusion aurait baissé.
  - Un job ZAP par rôle : 8 jobs de plus, au risque de dépasser la limite de runners simultanés.
