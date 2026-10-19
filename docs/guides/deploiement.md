# Guide de déploiement — CI/CD Kemdia

Ce guide met en ligne Kemdia selon les pratiques DevOps standard :

- **une seule image Docker** construite et scannée une fois, puis promue d'environnement en environnement (_build once, deploy many_) ;
- **staging automatique** à chaque fusion dans `main` ;
- **production déclenchée par un tag de version** (`v0.1.0`), jamais par un push direct ;
- **test de fumée + retour arrière automatique** si la nouvelle version ne répond pas ;
- **aucun secret dans Git**, accès serveur par clé SSH restreinte, HTTPS automatique.

> 💡 Pas encore de serveur ? Une **démo publique gratuite** est possible tout de suite : voir [demo-gratuite.md](demo-gratuite.md).

## 1. Vue d'ensemble

```mermaid
flowchart LR
    dev[Poste dev] -->|PR| ci[CI : qualité + image scannée]
    ci -->|fusion dans main| img[(GHCR<br/>web:sha-…)]
    img -->|auto| stg[STAGING<br/>staging.kemdia.ga]
    stg -->|test de fumée OK| ok{Validation<br/>manuelle}
    ok -->|git tag v0.1.0| rel[Release :<br/>même image → web:v0.1.0]
    rel --> prod[PRODUCTION<br/>kemdia.ga]
    prod -->|échec du test| rb[Retour arrière auto]
```

| Fichier                          | Rôle                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- |
| `.github/workflows/ci.yml`       | Qualité → image → scan Trivy → publication GHCR → déploiement staging  |
| `.github/workflows/release.yml`  | Tag `vX.Y.Z` → promotion de l'image → Release GitHub → production      |
| `.github/workflows/_deploy.yml`  | Déploiement réutilisable : SSH, test de fumée, retour arrière          |
| `.github/workflows/security.yml` | Gitleaks, pnpm audit, Semgrep, ShellCheck (+ CodeQL si dépôt public)   |
| `deploy/bin/setup-server.sh`     | Prépare et durcit un serveur neuf (une fois)                           |
| `deploy/bin/init-secrets.sh`     | Tire les secrets d'un environnement sur le serveur (une fois, S7-T04)  |
| `deploy/bin/deploy.sh`           | Seule commande que la CI peut lancer sur le serveur                    |
| `deploy/bin/backup.sh`           | Sauvegarde chiffrée chaque nuit : bases, secrets, Caddy (S7-T05)       |
| `deploy/bin/restore.sh`          | Liste, vérifie et restaure les sauvegardes (S7-T05)                    |
| `deploy/systemd/`                | Minuteurs : sauvegarde 02:00, vérification de restauration le dimanche |
| `deploy/app/compose.yml`         | Site + API + PostgreSQL (lecture seule, sans privilèges, S7-T04)       |
| `deploy/proxy/`                  | Caddy : HTTPS Let's Encrypt, staging protégé par mot de passe          |

> **S7-T04 (ADR-0043)** : le serveur fait tourner, par environnement (staging, production), le **site**, l'**API** et
> **PostgreSQL 18**, chacun dans son conteneur durci. Les deux images (site et API) sont déployées ensemble, par digest,
> avec les migrations de la base **avant** la bascule. Chaque environnement a sa base et ses réseaux : la préproduction ne
> peut pas toucher les données réelles. La CI monte toute cette pile à chaque PR (job « Pile serveur »).

```
Internet ─► Caddy (80/443) ─► site ──(réseau app)──► API ──(réseau private, sans Internet)──► PostgreSQL
                              aucun port publié en dehors de Caddy ; le site ne voit jamais la base
```

## 2. Ce qu'il vous faut

| Élément        | Recommandation                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Serveur        | VPS **Ubuntu 24.04**, 2 vCPU, 4 Go RAM, 40 Go SSD — suffisant pour staging + production au début. Région Europe de l'Ouest (Paris, Marseille, Francfort…) : bonne latence vers le Gabon via les câbles sous-marins. Exemples : OVHcloud, Scaleway, Hetzner, DigitalOcean. |
| Nom de domaine | `kemdia.ga` (auprès d'un registraire qui propose le `.ga`) ou `kemdia.com`                                                                                                                                                                                                |
| DNS            | 3 enregistrements **A** vers l'IP du serveur : `kemdia.ga`, `www.kemdia.ga`, `staging.kemdia.ga`                                                                                                                                                                          |
| GitHub         | Votre dépôt `levy-kombila/kemdia` (privé)                                                                                                                                                                                                                                 |

> Dans ce guide, remplacez `kemdia.ga` par votre domaine réel et `IP` par l'adresse du serveur.

## 3. Créer les deux clés SSH (sur votre PC Windows, PowerShell)

```powershell
# Clé personnelle d'administration (protégez-la par une phrase de passe quand elle est demandée)
ssh-keygen -t ed25519 -C "levy-admin" -f $HOME\.ssh\kemdia_admin

# Clé dédiée à GitHub Actions (sans phrase de passe, elle ne pourra QUE lancer deploy.sh)
ssh-keygen -t ed25519 -C "github-actions-kemdia" -f $HOME\.ssh\kemdia_ci -N '""'
```

Deux clés distinctes : si la clé de la CI fuyait, elle ne permettrait que de redéployer une image signée par digest, sans shell.

## 4. Préparer le serveur (une seule fois)

Depuis le dossier du projet sur votre PC :

```powershell
scp -r deploy root@IP:/root/kemdia-deploy
ssh root@IP
```

Puis, **sur le serveur** (remplacez les clés par le contenu de `kemdia_admin.pub` et `kemdia_ci.pub`) :

```bash
ADMIN_USER=levy \
ADMIN_PUBKEY="ssh-ed25519 AAAA... levy-admin" \
CI_PUBKEY="ssh-ed25519 AAAA... github-actions-kemdia" \
IMAGE_REPO=ghcr.io/levy-kombila/kemdia \
  bash /root/kemdia-deploy/bin/setup-server.sh
passwd levy   # mot de passe pour sudo
```

Puis, **une fois par environnement**, les secrets (tirés au hasard sur le serveur, jamais affichés, jamais dans Git
ni dans GitHub) :

```bash
sudo /opt/kemdia/bin/init-secrets.sh production kemdia.ga
sudo /opt/kemdia/bin/init-secrets.sh staging staging.kemdia.ga
```

Ils sont écrits dans `/opt/kemdia/secrets/<env>.{db,api,web}.env` (0640, root et le groupe `deploy`). Le site ne reçoit
que la clé interne et son adresse ; seule l'API a les clés de chiffrement et l'adresse de la base. **Copie
`TOTP_ENCRYPTION_KEY` et `KYC_ENCRYPTION_KEY` dans ton gestionnaire de mots de passe** : perdues, les doubles
authentifications et les dossiers des vendeurs deviennent illisibles. Le script refuse de remplacer un fichier existant.

Puis les **sauvegardes** (une fois, voir [§11](#11-sauvegardes-et-restauration)) :
`sudo /opt/kemdia/bin/backup.sh init`, et copie `/opt/kemdia/secrets/backup.password` dans ton gestionnaire de mots
de passe.

**E-mails** : `EMAIL_TRANSPORT=none` au départ. Pour envoyer avec Brevo, ouvre `sudo nano /opt/kemdia/secrets/<env>.api.env`,
mets `EMAIL_TRANSPORT=brevo`, `BREVO_API_KEY=…` et `EMAIL_FROM=…` (adresse vérifiée dans Brevo), puis redéploie.

Le script : met à jour le système (et active les mises à jour de sécurité automatiques), installe Docker,
crée l'administrateur `levy` et l'utilisateur `deploy` (clé CI restreinte à `deploy.sh`),
interdit la connexion root et par mot de passe, ouvre uniquement les ports 22/80/443, active Fail2ban,
redémarre la nuit (03:30) seulement quand un correctif l'exige, pose des réglages réseau prudents du noyau, et
déclare le **seul dépôt d'images** que `deploy.sh` acceptera (`/opt/kemdia/deploy.conf`, propriété de root).

⚠️ **Avant de fermer la session root**, vérifiez dans un autre terminal : `ssh -i $HOME\.ssh\kemdia_admin levy@IP`.

## 5. Démarrer le reverse proxy (HTTPS)

Sur le serveur, connecté en `levy` :

```bash
# Mot de passe de la préproduction (à communiquer à l'équipe)
sudo docker run --rm caddy:2-alpine caddy hash-password --plaintext 'UnMotDePasseLongEtUnique'
sudo nano /opt/kemdia/proxy/.env
```

```ini
ACME_EMAIL=votre-email@exemple.com
PROD_DOMAIN=kemdia.ga
STAGING_DOMAIN=staging.kemdia.ga
STAGING_USER=equipe
STAGING_PASSWORD_HASH='$2a$14$...collez le hash entre apostrophes...'
```

```bash
cd /opt/kemdia/proxy && sudo docker compose up -d
sudo docker logs kemdia-caddy --tail 20     # certificats obtenus une fois les DNS propagés
```

(Tant qu'aucune version n'est déployée, les domaines répondent « 502 » : c'est normal.)

## 6. Configurer GitHub

**Settings → Secrets and variables → Actions → onglet _Secrets_ → New repository secret**

| Secret                   | Valeur                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `DEPLOY_SSH_HOST`        | IP (ou nom) du serveur                                                                          |
| `DEPLOY_SSH_KEY`         | Contenu **complet** de `kemdia_ci` (la clé privée, lignes BEGIN/END comprises)                  |
| `DEPLOY_SSH_KNOWN_HOSTS` | Résultat de `ssh-keyscan -t ed25519 IP` (épingle l'identité du serveur, empêche l'interception) |
| `STAGING_BASIC_AUTH`     | `equipe:UnMotDePasseLongEtUnique` (pour le test de fumée du staging)                            |

**Onglet _Variables_ → New repository variable**

| Variable   | Valeur              |
| ---------- | ------------------- |
| `SITE_URL` | `https://kemdia.ga` |

> `SITE_URL` (variable GitHub) est l'adresse inscrite à la construction de l'image. Chaque serveur peut la remplacer
> au démarrage par sa propre variable d'environnement `SITE_URL` (utilisée pour les aperçus WhatsApp, le sitemap et robots.txt).
> | `STAGING_URL` | `https://staging.kemdia.ga` |
> | `PRODUCTION_URL` | `https://kemdia.ga` |

Tant que `DEPLOY_SSH_HOST` n'est pas défini, l'étape de déploiement est simplement ignorée (la CI reste verte).

## 7. Premier déploiement en staging

Fusionnez une PR dans `main` (ou _Actions → CI/CD → Run workflow_ sur `main`). Le pipeline :

1. vérifie le code (format, lint, types, 37 tests, build) ;
2. construit les images du site et de l'API, les scanne avec Trivy, les publie sur
   `ghcr.io/levy-kombila/kemdia/{web,api}:sha-<commit>` ;
3. se connecte au serveur avec la clé restreinte, déploie les deux **par digest** : base démarrée, **migrations** avec la
   nouvelle API, puis bascule de l'API et du site ;
4. attend que tout soit sain, vérifie `/api/health` (bonne version), la page d'accueil et les en-têtes de sécurité ;
5. en cas d'échec : revient automatiquement à la version précédente.

Ouvrez <https://staging.kemdia.ga> (identifiants de l'étape 5) et testez.

## 8. Mise en production

Quand le staging est validé :

```powershell
git switch main
git pull
git tag -a v0.1.0 -m "Kemdia v0.1.0 — Sprint 1 : frontend"
git push origin v0.1.0
```

Le workflow **Release** vérifie que le tag est sur `main`, réutilise **exactement les images testées par la CI**
(site et API, re-étiquetées `v0.1.0`, sans reconstruction), crée la Release GitHub avec les notes de version,
déploie en production et lance le test de fumée.

> Depuis le S7-T04, l'API et la base sont déployées avec le site : la réserve « ne pas publier de version tant que l'API
> n'est pas sur le serveur » est levée. Avant la vraie ouverture : sauvegardes chiffrées testées (S7-T05) et
> surveillance (S7-T06).

> Seul le propriétaire du dépôt peut déclencher la production.
> Avec GitHub Pro/Team, on peut en plus exiger une approbation manuelle via un _Environment_ « production » (voir §11).

## 9. Revenir à une version précédente

- **Automatique** : si le conteneur n'est pas sain ou si le test de fumée échoue.
- **Manuel** : _Actions → Release → Run workflow_ → version `v0.1.0` (une version déjà publiée).
- **En urgence sur le serveur** : `sudo -u deploy /opt/kemdia/bin/deploy.sh production rollback </dev/null`
- Le retour arrière remet le site et l'API d'avant ; il ne défait **pas** les migrations : elles n'ajoutent que ce que
  l'ancienne version ignore (règle du projet). Une migration refusée arrête le déploiement avant toute bascule.

Historique des déploiements : `/opt/kemdia/deploy.log`.

## 10. Exploitation

| Besoin           | Commande / action                                                                                                                           |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Voir l'état      | `docker ps` · `curl -s https://kemdia.ga/api/health`                                                                                        |
| Logs applicatifs | `docker logs kemdia-production-web --since 1h` · `docker logs kemdia-production-api --since 1h`                                             |
| Base de données  | `sudo docker exec -it kemdia-production-db psql -U kemdia` (aucun port ouvert : seulement depuis le serveur)                                |
| Logs HTTP        | `docker logs kemdia-caddy --since 1h`                                                                                                       |
| Surveillance     | Service externe gratuit (ex. UptimeRobot) qui appelle `https://kemdia.ga/api/health` toutes les 5 min et vous alerte par e-mail/SMS         |
| Mises à jour OS  | Automatiques (unattended-upgrades) ; redémarrage mensuel planifié conseillé                                                                 |
| Sauvegardes      | Automatiques chaque nuit (bases, secrets, Caddy) : voir [§11](#11-sauvegardes-et-restauration) ; état : `cat /opt/kemdia/state/backup.last` |

### Adresse des visiteurs en production (S4-T07, ADR-0021)

Sur le VPS, le relais de confiance est **Caddy**, pas Cloudflare : le réglage de la démo (`CLIENT_IP_HEADER=cf-connecting-ip`)
**ne doit pas** être repris tel quel. Sans Cloudflare devant le serveur, n'importe qui pourrait envoyer un faux `CF-Connecting-IP`.

| Situation                                   | Réglage du site                                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Caddy seul devant le site (cas prévu)       | `CLIENT_IP_HEADER=x-forwarded-for` : le site prend la **dernière** adresse, posée par Caddy (adresse réelle de la connexion)                                   |
| Cloudflare devant Caddy (si ajouté un jour) | Déclarer les adresses de Cloudflare dans `trusted_proxies` de Caddy, n'accepter que Cloudflare sur les ports 80/443, puis seulement ensuite `cf-connecting-ip` |

Points d'attention :

- **IPv6 et Docker** : Caddy tourne dans Docker. Si l'IPv6 n'est pas activé dans Docker, les visiteurs IPv6 (souvent en 4G)
  arrivent avec l'adresse de la passerelle Docker (`172.x.0.1`) et partagent une seule limite. Vérifier avec `curl -6` ; si
  l'adresse vue commence par `172.`, activer `"ipv6": true` et `"ip6tables": true` dans `/etc/docker/daemon.json`
  (ou ne pas publier d'enregistrement DNS AAAA).
- **Pare-feu** : `ufw` ne filtre pas les ports publiés par Docker. Pour n'accepter que Cloudflare (cas Cloudflare devant Caddy),
  filtrer dans la chaîne `DOCKER-USER` d'iptables.
- Avant l'ouverture, refaire sur la production la vérification de la démo (adresse réelle puis fausse valeur, en `-4` **et** en `-6`,
  en Wi-Fi et en 4G), avec un diagnostic temporaire équivalent.

## 11. Sauvegardes et restauration

S7-T05 ([ADR-0044](../architecture/adr/0044-sauvegardes-restic.md)). Outil : **restic** (paquet Ubuntu), chiffrement
AES-256 avec un mot de passe qui n'existe que sur le serveur et dans ton gestionnaire de mots de passe.

| Quoi                         | Quand                                         | Où                                                                     |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| Base de chaque environnement | Chaque nuit, 02:00 (`kemdia-backup`)          | `/var/backups/kemdia` (local), puis copie vers S3 si configuré         |
| Secrets et `.env` de Caddy   | Même sauvegarde                               | Idem (sans le mot de passe des sauvegardes ni l'accès S3)              |
| Vérification de restauration | Chaque dimanche, 05:00                        | Base temporaire `kemdia_verif`, supprimée ensuite ; 10 % du dépôt relu |
| Rétention                    | 7 quotidiennes, 4 hebdomadaires, 6 mensuelles | Dans chaque dépôt                                                      |

Résultats : `/opt/kemdia/state/backup.last` et `/opt/kemdia/state/restore-check.last` (`resultat=ok` attendu) ;
journal : `journalctl -u kemdia-backup -u kemdia-restore-check`.

### Mise en place (une fois)

1. `sudo /opt/kemdia/bin/backup.sh init` : crée `/opt/kemdia/secrets/backup.password` et le dépôt local.
2. **Copie ce mot de passe dans ton gestionnaire de mots de passe**, avec `TOTP_ENCRYPTION_KEY` et
   `KYC_ENCRYPTION_KEY`. Sans lui, aucune sauvegarde ne peut être relue, par personne.
3. Copie hors du serveur (recommandé) : créer un bucket chez un stockage compatible S3 (ex. Cloudflare R2, 10 Go
   gratuits) et une clé d'accès **limitée à ce bucket**, puis :

   ```bash
   sudo install -m 600 /dev/null /opt/kemdia/secrets/backup-s3.env
   sudo nano /opt/kemdia/secrets/backup-s3.env
   #   RESTIC_S3_REPOSITORY=s3:https://<compte>.r2.cloudflarestorage.com/kemdia-sauvegardes
   #   AWS_ACCESS_KEY_ID=…
   #   AWS_SECRET_ACCESS_KEY=…
   #   AWS_DEFAULT_REGION=auto
   sudo /opt/kemdia/bin/backup.sh init        # prépare aussi le dépôt S3
   ```

   Garde aussi ces quatre lignes dans ton gestionnaire de mots de passe (elles servent après la perte du serveur).
   Limite : un pirate devenu root sur le serveur pourrait effacer aussi cette copie (voir ADR-0044) ; en attendant
   une parade décidée avec le client, copie chaque mois le dossier chiffré `/var/backups/kemdia` sur un disque
   gardé hors ligne (`sudo rsync -a /var/backups/kemdia/ …`).

4. Essai immédiat : `sudo systemctl start kemdia-backup && cat /opt/kemdia/state/backup.last`.

### Restaurer

| Situation                                | Commande                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Voir les sauvegardes                     | `sudo /opt/kemdia/bin/restore.sh liste` (ajouter `--s3` pour la copie hors du serveur)       |
| Vérifier sans rien toucher               | `sudo /opt/kemdia/bin/restore.sh verifier production`                                        |
| Revenir en arrière (erreur, suppression) | `sudo /opt/kemdia/bin/restore.sh remplacer production <id ou latest> --confirmer production` |

`remplacer` restaure d'abord la sauvegarde **à côté** (le site tourne encore ; en cas d'échec, rien n'est touché), puis
arrête le site et l'API quelques secondes, met la base restaurée en service et garde l'ancienne sous
`kemdia_avant_<date>` (la commande pour la supprimer après contrôle est affichée). Si l'API ne démarre pas sur la base
restaurée, l'ancienne est remise en service. Tout ce qui a été fait **après** la sauvegarde choisie est perdu. Utiliser la version de l'application qui tournait au moment de la sauvegarde
(une migration plus récente peut être relancée ensuite par un déploiement).

### Serveur perdu (incendie, piratage, résiliation)

1. Nouveau serveur : §4 (`setup-server.sh`), **sans** lancer `init-secrets.sh`.
2. Mot de passe et accès S3 depuis le gestionnaire de mots de passe :
   `sudo install -m 600 /dev/null /opt/kemdia/secrets/backup.password` puis `sudo nano` (même chose pour
   `backup-s3.env`).
3. Secrets : `sudo /opt/kemdia/bin/restore.sh fichiers /root/kemdia-restaure --s3`, puis recopier
   `/root/kemdia-restaure/opt/kemdia/secrets/*.env` dans `/opt/kemdia/secrets/` (`sudo install -m 640 -g deploy …`)
   et `…/proxy/.env` dans `/opt/kemdia/proxy/` ; supprimer `/root/kemdia-restaure`.
4. Caddy (§5), puis déployer la dernière version (Release → Run workflow).
5. `sudo /opt/kemdia/bin/restore.sh remplacer production latest --confirmer production --s3`, puis
   `sudo /opt/kemdia/bin/backup.sh init` (nouveau dépôt local).

Ce scénario complet (base et dépôt local effacés, restauration depuis S3, contenu comparé table par table) est rejoué
par la CI à chaque PR (job « Pile serveur »).

## 12. Limites du plan GitHub gratuit (dépôt privé)

| Fonction                                                   | Gratuit (privé)          | GitHub Pro / Team                                   |
| ---------------------------------------------------------- | ------------------------ | --------------------------------------------------- |
| Actions, GHCR, secrets du dépôt                            | ✅                       | ✅                                                  |
| Protection de la branche `main` (PR obligatoire, CI verte) | ❌                       | ✅                                                  |
| Environments avec approbation manuelle                     | ❌                       | ✅ (Pro : environnements ; approbateurs selon plan) |
| CodeQL / revue des dépendances                             | ❌ (Semgrep le remplace) | Avec GitHub Advanced Security                       |

Sans protection de branche, la règle d'équipe est : **jamais de push direct sur `main`**, toujours une PR avec CI verte.

## 13. Liste de contrôle avant la vraie ouverture au public

- [ ] Secrets de l'ancien projet Django changés, ancien dépôt archivé
- [ ] Domaine, DNS et HTTPS opérationnels (note A sur <https://www.ssllabs.com/ssltest/>)
- [ ] Surveillance externe de `/api/health` active
- [ ] Sauvegardes : `backup.sh init`, copie S3 configurée, mot de passe dans le gestionnaire, `backup.last` à `ok`
- [ ] Mentions légales et politique de confidentialité complétées
- [ ] Vrai catalogue et photos HD (les données actuelles sont des données de démonstration)
