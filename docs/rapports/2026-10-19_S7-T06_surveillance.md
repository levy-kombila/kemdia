# Rapport — S7-T06 : surveillance et alertes

|                                                 |                                      |
| ----------------------------------------------- | ------------------------------------ |
| **Date**                                        | 2026-10-19                           |
| **Sprint / tâches**                             | S7 — S7-T06                          |
| **Version**                                     | v0.7.0 → (v0.8.0 à la clôture du S7) |
| **Sections du cahier d'architecture modifiées** | §8 — version 4.12                    |

## 1. Résumé

Le propriétaire est maintenant prévenu d'une panne par deux regards complémentaires :

- **UptimeRobot**, de l'extérieur, voit ce que voit un visiteur, y compris un serveur éteint ;
- **Healthchecks.io** reçoit toutes les 5 minutes le résultat de `monitor.sh`, qui vérifie l'intérieur du serveur :
  conteneurs, HTTPS, certificats, disque, mémoire, sauvegardes. Healthchecks alerte aussi si le serveur se tait.

Les journaux du site sont désormais en JSON, au même format que ceux de l'API. La CI simule les pannes et vérifie que
l'alerte part, puis que le retour à la normale est signalé.

## 2. Fonctionnalités livrées

| Élément              | Description                                                                                                                                                            | Fichiers                                                            |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Surveillance interne | `monitor.sh` (systemd, toutes les 5 min, confiné, 2 min au plus) : santé des conteneurs, parcours https → site → API → base, certificats, disque, mémoire, sauvegardes | `deploy/bin/monitor.sh`, `deploy/systemd/kemdia-monitor.*`          |
| Alertes              | Healthchecks.io : signal « ok » ou `/fail` avec la liste des problèmes ; silence = alerte ; arrêt par délai signalé                                                    | `deploy/bin/monitor.sh`                                             |
| Santé complète       | `/api/health?complet=1` : API et base, 503 en cas de panne, gardé 10 s (une seule requête à la fois)                                                                   | `apps/web/src/app/api/health/route.ts`, `lib/health/deep-health.ts` |
| Journaux du site     | JSON en production (format pino de l'API), texte lisible ailleurs ; 35 messages convertis                                                                              | `apps/web/src/lib/log.ts` et les adaptateurs `lib/*/api-*.ts`       |
| Test CI              | Pannes simulées (base arrêtée, sauvegarde ratée, disque au-dessus du seuil) et retour à la normale, faux Healthchecks, erreur JSON du site                             | `.github/workflows/ci.yml` (job « Pile serveur »)                   |
| Guide                | Création des comptes Healthchecks et UptimeRobot, seuils, que faire pour chaque alerte                                                                                 | `docs/guides/deploiement.md` §10                                    |

## 3. Décisions techniques

- [ADR-0045](../architecture/adr/0045-surveillance-alertes.md) : UptimeRobot + Healthchecks.io (gratuits), journaux
  JSON gardés sur le serveur, pannes simulées en CI (les quatre options recommandées, choix du 2026-10-19).
- Le `/api/health` simple ne change pas : le site n'est pas déclaré malade quand l'API l'est. Docker et le
  déploiement ne réagissent donc pas à tort.
- Pas d'identifiant de requête commun au site et à l'API : le catalogue du site regroupe les requêtes de plusieurs
  visiteurs.

## 4. Sécurité

Relecture indépendante (agent séparé, avant la PR) : **0 grave, 3 moyennes, 8 faibles**. Constats confirmés sans
problème : l'adresse de Healthchecks ne peut pas être détournée par injection, n'apparaît pas dans la liste des
processus, et la santé complète ne permet ni amplification ni SSRF.

| Constat                                                                                                       | Correction                                                                                                |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Moyen : le compte `deploy` (propriétaire du dossier d'état) pouvait faire écraser un fichier système par root | Fichier temporaire au nom imprévisible (`mktemp`) puis `mv` ; vérifié en local (lien piégé laissé intact) |
| Moyen : une vérification bloquée (TLS, Docker) se terminait sans alerte ni raison                             | Délais sur `docker inspect` et `openssl` ; arrêt par systemd signalé à Healthchecks                       |
| Moyen : disque plein → l'état ne s'écrit pas et l'alerte ne part pas                                          | Alerte envoyée **avant** l'écriture de l'état ; échec d'écriture seulement journalisé                     |
| Faible : date d'état dans le futur acceptée comme « récente »                                                 | Refusée (traitée comme illisible)                                                                         |
| Faible : erreur de réglage → arrêt sans alerte ; `PROD_DOMAIN` absent → vérifications sautées en silence      | Signalés comme problèmes (alerte)                                                                         |
| Faible : domaines non protégés contre le découpage ; HC en http                                               | Liste validée et entre guillemets ; https obligatoire (http seulement vers 127.0.0.1, pour la CI)         |
| Faible : santé complète en 500 si l'adresse de l'API manque                                                   | 503 « dégradé »                                                                                           |
| Faible : confinement systemd perfectible, `deploy` peut écrire l'état des sauvegardes                         | Accepté : le compte `deploy` est déjà équivalent à root (groupe docker, ADR-0043)                         |

## 5. Qualité

- Tests unitaires : journal (texte et JSON, niveaux, retour à la ligne échappé) ; santé complète (saine, base en panne,
  API injoignable, réponse inattendue, sans clé interne, cache de 10 s, une seule requête simultanée). 263 tests du site
  passent sans changement : les messages hors production sont identiques.
- CI « Pile serveur », étape « Surveillance », par systemd comme sur le serveur :
  - tout va bien → signal ;
  - base arrêtée → 503 vu de l'extérieur, alerte « production : db », erreur JSON (niveau 50) dans le journal du site ;
  - retour à la normale → signal ;
  - sauvegarde ratée → alerte ;
  - disque au-dessus du seuil → alerte.
- Essais locaux de `monitor.sh` (faux Docker, faux Healthchecks) : base en panne, sauvegarde ratée ou ancienne,
  sauvegardes non configurées, réglages invalides, lien piégé, adresse invalide.
- ShellCheck, format, lint, types ; Gitleaks et Semgrep : voir la PR.
- Aucune migration de base ; aucun réglage Render ni fichier `.env` modifié.

## 6. Captures d'écran

Sans objet (aucun écran).

## 7. Limites connues / dette technique

- Il faut créer les comptes Healthchecks et UptimeRobot le jour de la location : sans eux, aucune alerte ne part (l'état
  reste dans `monitor.last` et le journal).
- La préproduction n'est pas surveillée de l'extérieur (protégée par mot de passe) ; ses conteneurs le sont de
  l'intérieur.
- Journaux gardés seulement sur le serveur (5 × 10 Mo par conteneur) : pas de recherche à distance.
- `/api/health?complet=1` dit publiquement si la base est en panne (aucune autre information).

## 8. Prochaines étapes

- Le jour de la location : comptes Healthchecks (période 5 min, grâce 10 min) et UptimeRobot, `monitor.env` (guide
  §10).
- S7-T07 : test d'intrusion (OWASP ZAP dans la CI et revue ASVS niveau 1).
