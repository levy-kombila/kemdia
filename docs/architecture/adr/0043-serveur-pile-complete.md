# ADR-0043 — Serveur : site, API et PostgreSQL par environnement, secrets sur le serveur

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Tâche** : S7-T04
- **Complète** : [ADR-0005](0005-strategie-deploiement.md) (stratégie de déploiement), [ADR-0021](0021-csrf-csp-limites.md)
  (adresse des visiteurs)

## Contexte

La pile du serveur (`deploy/`) date du S1 : elle ne déployait que **le site**. Depuis le S3, le site lit toujours
l'API, qui a besoin de PostgreSQL et de secrets (clé interne, clés de chiffrement TOTP et KYC, Brevo). Un serveur
installé avec cette pile n'aurait donc pas fonctionné, et rien n'avait été essayé sur une vraie machine. Le cahier
d'architecture (§8) prévoyait « API et base de production au S7 ».

Choix du propriétaire (2026-10-19) :

| Question                  | Choix                                                                                             |
| ------------------------- | ------------------------------------------------------------------------------------------------- |
| PostgreSQL                | **Docker sur le VPS**, sur un réseau privé (gratuit ; sauvegardes chiffrées au S7-T05)            |
| Staging et production     | **Un PostgreSQL par environnement** : la préproduction ne peut jamais toucher les données réelles |
| Secrets                   | **Fichiers sur le serveur**, tirés par un script ; jamais dans Git ni dans GitHub                 |
| Vérification sans serveur | **Job CI** qui monte toute la pile avec les vrais fichiers de `deploy/`                           |

## Décision

1. **`deploy/app/compose.yml`** (une instance par environnement) : `db` (PostgreSQL 18, SCRAM-SHA-256, lecture seule
   hors des données, cinq droits Linux seulement), `migrate` (tâche ponctuelle avec l'image de l'API, profil
   `migrations`), `api`, `web` — tous `no-new-privileges`, mémoire et processus bornés, journaux limités. Réseaux :
   - `edge` (externe) : Caddy ↔ site ;
   - `app` : site ↔ API, sortie Internet de l'API (Brevo, plus tard Mobile Money) ;
   - `private` (**internal**) : API ↔ base, sans sortie ; le site ne voit pas la base.
     `app` et `private` sont propres à chaque environnement. **Aucun port publié** en dehors de Caddy (80/443).
2. **`init-secrets.sh <env> <domaine>`** (root, une fois) : mot de passe de la base, clé interne (64 caractères), clés
   TOTP et KYC (32 octets, différentes). Trois fichiers `/opt/kemdia/secrets/<env>.{db,api,web}.env`, 0640
   root:deploy ; le site ne reçoit que la clé interne et son adresse. Le script **ne remplace jamais** un fichier
   existant et n'affiche aucun secret. E-mails : `none` jusqu'à la configuration de Brevo.
3. **`deploy.sh`** : `<env> <site@sha256> <api@sha256> <version>` ou `<env> rollback`. Images acceptées **seulement
   depuis le dépôt déclaré** dans `/opt/kemdia/deploy.conf` (propriété de root ; avant : n'importe quelle image de
   `ghcr.io`). Ordre : téléchargement → base démarrée → **migrations** avec la nouvelle API (refus : rien ne bascule) →
   API et site → santé ; sinon retour à l'état précédent. Le retour arrière ne défait pas les migrations : elles ne
   font qu'ajouter (règle du projet).
4. **`setup-server.sh`** : en plus du S1 (pare-feu 22/80/443, SSH par clé, Fail2ban, mises à jour automatiques) —
   réglages réseau prudents du noyau (`sysctl`), SSH plus strict (délai de connexion, sessions inactives, pas de
   transfert d'agent), redémarrage de nuit seulement si un correctif l'exige, dossier des secrets, `deploy.conf`.
   Option `--fichiers-seulement` pour la CI (n'installe que les fichiers, ne durcit rien).
5. **Workflows** : `_deploy.yml` reçoit `api-image` ; le staging et la production (release) déploient le site et
   l'API de la même version.
6. **Job CI « Pile serveur »** : images construites depuis le cache de la CI et servies par un registre local ;
   `setup-server.sh --fichiers-seulement`, `init-secrets.sh`, Caddy (HTTPS local) et le vrai `deploy.sh`. Vérifie :
   version servie derrière Caddy, en-têtes de sécurité, API et base saines, aucun port interne ouvert, le site ne
   résout pas la base, la base n'a pas d'Internet, secrets non remplacés et bien répartis, nouvelle version puis
   retour arrière, refus des images hors du dépôt, sans digest ou avec une version piégée.

## Conséquences

- Un serveur loué devient opérationnel avec `setup-server.sh`, deux `init-secrets.sh`, le `.env` de Caddy et les
  secrets GitHub déjà décrits : rien d'autre à inventer le jour J.
- Les clés TOTP et KYC n'existent que sur le serveur : leur **copie dans un gestionnaire de mots de passe** est à la
  charge du propriétaire (sans elle, une perte du serveur rend ces données illisibles même avec une sauvegarde).
- Mémoire : deux environnements complets tiennent dans 4 Go (bornes : base 768 Mo, API 512 Mo, site 512 Mo chacun).
- La pile est testée à chaque PR qui touche du code (~10 min de CI en plus, en parallèle des autres jobs).

## Alternatives écartées

- **Base gérée payante** : sauvegardes et mises à jour incluses, mais coût à discuter avec le client.
- **Une seule instance PostgreSQL, deux bases** : moins de mémoire, mais une erreur de configuration mélangerait
  préproduction et production.
- **Secrets GitHub envoyés à chaque déploiement** : un dépôt ou une CI compromise les exposerait ; ils transiteraient
  par le réseau à chaque déploiement.
- **Relecture seulement, sans test** : le premier essai aurait eu lieu le jour de la location.
