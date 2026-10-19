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
3. **La production attend des tests verts.** Sur `main`, les images sont publiées avec leur seule étiquette `sha-…`
   pendant que les tests tournent. « L'image existe » ne prouve donc plus que « la CI a réussi ». Avant de promouvoir
   quoi que ce soit, `release.yml` vérifie que les **6 jobs de test** de la CI/CD du commit sont verts : qualité, base,
   bout en bout, pile serveur et les deux images. Le run doit venir de `main`, d'un push et de `ci.yml` ; l'attente est
   de 30 min au plus, et le job dispose désormais de 60 min. Les déploiements staging et démo ne comptent pas : une
   panne de Render ne bloque pas la production.
4. **Étiquettes mobiles après validation.** `main` (GHCR, Docker Hub) et `latest` (Docker Hub, l'image que tire
   Render) ne sont posées que par le nouveau job « Étiquettes main et latest », une fois tous les tests verts, sur le
   digest déjà publié (`docker buildx imagetools create`, sans rien reconstruire).
5. **Scan ZAP : toujours un rôle après l'autre, mais plus robuste.** Les 4 rôles en même temps ont été essayés sur la
   PR #82 : le scan du site a duré 6 min 35, contre 6 min 20 en séquentiel. Les 4 ZAP et la pile testée se partagent
   les 4 processeurs du runner, donc chaque exploration ralentit ; c'est un gain nul pour une couverture moins sûre.
   On garde l'ordre séquentiel et les corrections de la relecture :
   - mémoire de Java bornée (4 Go) ;
   - un ZAP sorti avec un code différent de 0 sans alerte bloquante (plan en échec, Java arrêté…) rend la CI
     **rouge**, car un rapport partiel ne doit plus passer pour un vert ;
   - jetons de test retirés des journaux avant l'envoi de l'artefact public.

## Conséquences

- **Positives** :
  - Mesuré sur la PR #82 : la CI/CD passe de **13 min 20 à 6 min** (pile serveur en dernier). Le passage complet,
    jusqu'au dernier check run, passe d'environ **13 min à 7 min** : ZAP du site (6 min 48, dont 2 min 20 pour
    monter la pile) et la pile serveur terminent en dernier.
  - Un passage rouge est connu plus tôt, puisque chaque job signale son échec sans attendre les autres.
  - Les déploiements sont **plus** stricts qu'avant, car la pile serveur devient une condition.
- **Négatives** :
  - Sur `main`, une image peut être publiée dans GHCR et Docker Hub pour un commit dont les tests échouent ensuite.
    Elle n'est alors déployée nulle part et ne reçoit ni `main` ni `latest` : elle reste seulement visible dans les
    registres sous l'étiquette `sha-…`.
  - Quand le job de qualité échoue, les autres jobs tournent quand même jusqu'au bout. Il y a plus de minutes de runner
    consommées, mais elles sont gratuites pour un dépôt public. Un nouveau push annule l'ancien passage d'une PR.
  - Environ 17 jobs démarrent ensemble, sous la limite de 20 runners simultanés d'un compte gratuit.
- **Alternatives écartées** :
  - Garder l'attente : environ 4 min de plus à chaque passage, refusé par le propriétaire.
  - Publier les images seulement dans le job de déploiement : cela demande de reconstruire ou de transférer l'image
    entre jobs, et c'est plus complexe pour un gain nul en sécurité, la production vérifiant déjà la CI.
  - Raccourcir l'exploration de ZAP : la couverture du test d'intrusion aurait baissé.
  - Un job ZAP par rôle : 8 jobs de plus, au risque de dépasser la limite de runners simultanés.
  - Les 4 rôles ZAP en même temps sur un seul runner : essayé, sans gain mesuré (voir le point 5).
