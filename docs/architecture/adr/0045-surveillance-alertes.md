# ADR-0045 — Surveillance et alertes : UptimeRobot, Healthchecks.io, journaux JSON

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Tâche** : S7-T06
- **Complète** : [ADR-0043](0043-serveur-pile-complete.md) (pile du serveur), [ADR-0044](0044-sauvegardes-restic.md)
  (sauvegardes)

## Contexte

Le serveur (S7-T04) et les sauvegardes (S7-T05) tournent seuls, mais personne n'était prévenu d'une panne :

- site, API ou base arrêtés ;
- sauvegarde ratée, disque plein ;
- certificat HTTPS non renouvelé.

Les journaux de l'API sont en JSON (pino) depuis le S3. Ceux du site étaient en texte libre. Le cahier vise 99,9 % de
disponibilité en production.

Choix du propriétaire (2026-10-19) :

| Question         | Choix                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Sonde externe    | **UptimeRobot gratuit** (toutes les 5 min, depuis Internet)                                   |
| Alertes internes | **Healthchecks.io gratuit** : signal toutes les 5 min, alerte sur problème **ou** sur silence |
| Journaux du site | **JSON comme l'API**, gardés sur le serveur                                                   |
| Vérification     | **Pannes simulées dans la CI**                                                                |

## Décision

1. **Deux regards complémentaires.**
   - **UptimeRobot**, de l'extérieur, appelle `https://<domaine>/api/health?complet=1`. Il voit ce que voit un
     visiteur, y compris un serveur éteint ou un réseau coupé.
   - **Healthchecks.io**, de l'intérieur, reçoit le résultat de `monitor.sh`. Il voit ce qu'un visiteur ne voit pas
     encore (sauvegardes, disque, certificat). Il alerte aussi quand le serveur **se tait**.
2. **`/api/health?complet=1`** (site) : appelle le `/api/health` public de l'API (sans clé) et répond 503 si l'API ou
   sa base est en panne. Le résultat est gardé 10 s, avec une seule requête à la fois : appeler cette adresse en boucle
   ne charge ni l'API ni la base. Le `/api/health` simple ne change pas (Docker, test de fumée) : le site n'est pas
   déclaré malade quand l'API l'est, ce qui évite de redémarrer ou d'annuler un déploiement à tort.
3. **`monitor.sh`** (root, minuteur systemd toutes les 5 min, confiné) vérifie :
   - la santé Docker de la base, de l'API et du site de chaque environnement, et Caddy ;
   - le parcours https → site → API → base de la production ;
   - les certificats (alerte à moins de 14 jours ; Caddy renouvelle à 30) ;
   - le disque (alerte à 85 %) et la mémoire libre (alerte sous 10 %) ;
   - les sauvegardes (nuit réussie depuis moins de 26 h, restauration vérifiée depuis moins de 8 jours, sauvegardes
     configurées).

   Le résultat part vers Healthchecks : un signal « ok », ou `/fail` avec la liste des problèmes. L'adresse de
   Healthchecks est dans `/opt/kemdia/secrets/monitor.env` (0600 root) et passe par l'entrée de curl, jamais par ses
   arguments. L'état est aussi écrit dans `state/monitor.last`. Les messages ne contiennent que le nom des
   vérifications.

4. **Journaux du site** : `lib/log.ts`. En production, une ligne JSON au format de pino (`level`, `time`, `service`,
   `version`, `env`, `scope`, `msg`), comme l'API ; ailleurs, le texte habituel `[scope] message`. Les 35 messages du
   serveur du site y passent. Toujours aucune donnée personnelle ; un retour à la ligne glissé dans un message est
   échappé et ne crée pas de fausse ligne.
5. **CI (job « Pile serveur »)** : un faux Healthchecks local reçoit les signaux. La CI vérifie :
   - tout va bien → signal « ok » ;
   - base arrêtée → santé complète en 503, alerte qui nomme la base, erreur JSON dans le journal du site ;
   - retour à la normale → signal « ok » ;
   - sauvegarde ratée → alerte ;
   - disque au-dessus du seuil → alerte.

## Conséquences

- Pour être prévenu, il faut deux comptes gratuits, créés le jour de la location (guide de déploiement §10) :
  Healthchecks (période 5 min, grâce 10 min) et UptimeRobot (production ; la préproduction est protégée par mot de
  passe).
- Healthchecks prévient aussi du retour à la normale (« up »), ce qui évite de vérifier à la main.
- Les journaux restent sur le serveur (`docker logs`, rotation 5 × 10 Mo par conteneur). Pour les lire :
  `docker logs kemdia-production-web | grep '^{' | jq`.
- Pas d'identifiant de requête commun au site et à l'API : le catalogue du site regroupe les requêtes de plusieurs
  visiteurs (cache de 60 s), donc un identifiant par visiteur n'aurait pas de sens. L'API garde le sien.

## Alternatives écartées

- **Uptime Kuma sur le serveur** : joli tableau de bord, mais il tombe avec le serveur et prend de la mémoire.
- **Bot Telegram ou e-mail direct depuis le serveur** : aucun message si le serveur est éteint.
- **Prometheus / Grafana / Loki** : trop lourd pour un serveur de 4 Go et deux environnements.
- **Envoi des journaux vers un service externe** : recherche à distance plus pratique, mais les journaux quitteraient
  le serveur. À reconsidérer après le lancement.
