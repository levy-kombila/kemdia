# Démo publique gratuite — Render + Neon

Objectif : un lien public (ex. `https://kemdia.onrender.com`) pour montrer **le vrai système** à n'importe qui —
le site, l'API et une base PostgreSQL — **sans serveur payant**, mis à jour **automatiquement** à chaque fusion dans `main`.

C'est le même principe DevOps que pour staging/production : la CI construit, scanne et publie les images Docker,
puis la démo reçoit **exactement ces images** (par digest), et des tests vérifient que la bonne version répond.
Décisions : [ADR-0013](../architecture/adr/0013-demo-render-api-neon.md) (démo avec API, S3-T07).

```mermaid
flowchart LR
    merge[Fusion dans main] --> ci[CI : tests + images scannées]
    ci --> hub[(Docker Hub public<br/>levy2025/kemdia<br/>levy2025/kemdia-api)]
    ci -->|1. hook API + digest| api[Render Free<br/>kemdia-api.onrender.com]
    ci -->|2. hook site + digest| web[Render Free<br/>kemdia.onrender.com]
    hub --> api
    hub --> web
    web -->|HTTPS + clé interne| api
    api -->|migrations + import démo<br/>au démarrage| neon[(Neon Free<br/>PostgreSQL 18, Francfort)]
    web -->|/api/health : bonne version,<br/>catalogue = api ?| ok[✅ résumé dans Actions]
```

## Limites de l'offre gratuite (à connaître avant de partager le lien)

- Chaque service **s'endort après 15 min sans visite**. La première visite suivante réveille le site, qui réveille l'API :
  compter **1 à 2 minutes**. Ouvrez le lien vous-même juste avant une présentation.
- 750 heures d'instance par mois pour tout le compte Render : suffisant car les deux services dorment la plupart du temps.
- Base Neon gratuite : 1 Go, 100 heures de calcul par mois, s'endort après 5 min (réveil en moins d'une seconde).
- Données de démonstration uniquement : **aucune vraie donnée client** sur cet environnement.
- Sources : [Render — Free instances](https://render.com/docs/free), [Neon — Pricing](https://neon.com/pricing).

## Où sont les images Docker ?

Le pipeline publie **la même image** (même digest) à deux endroits :

| Image | Docker Hub (**public**, utilisé par Render)                            | GHCR (privé, staging/production)  |
| ----- | ---------------------------------------------------------------------- | --------------------------------- |
| Site  | `levy2025/kemdia` — <https://hub.docker.com/r/levy2025/kemdia>         | `ghcr.io/levy-kombila/kemdia/web` |
| API   | `levy2025/kemdia-api` — <https://hub.docker.com/r/levy2025/kemdia-api> | `ghcr.io/levy-kombila/kemdia/api` |

Étiquettes : `latest` et `main` (dernière version de `main`), `sha-<commit>` (une par version, pour revenir en arrière).

> Les images ne contiennent aucun secret (configuration par variables d'environnement) ni donnée réelle :
> les rendre publiques sur Docker Hub ne pose pas de problème de sécurité. Le code source, lui, reste privé.

## Mise en place

Les étapes 1 et 2 (site seul) ont été faites au S1. Pour une installation neuve, tout faire dans l'ordre.
**Pour passer la démo existante sur l'API (S3-T07) : étapes 3 à 6.**

### 1. Publier les images sur Docker Hub

1. Sur <https://hub.docker.com>, connecté avec `levy2025` : avatar → **Account settings → Personal access tokens → Generate new token**.
   Nom : `github-actions-kemdia`, permissions **Read & Write**, expiration 90 jours. **Copiez le jeton** (affiché une seule fois).
2. Sur GitHub → dépôt `kemdia` → **Settings → Secrets and variables → Actions** :

| Onglet        | Nom                  | Valeur              |
| ------------- | -------------------- | ------------------- |
| **Variables** | `DOCKERHUB_USERNAME` | `levy2025`          |
| **Secrets**   | `DOCKERHUB_TOKEN`    | le jeton Docker Hub |

> Le nom d'utilisateur peut aller dans **Variables** (conseillé : il n'est pas secret et reste lisible dans les résumés)
> ou dans **Secrets** (il apparaîtra alors masqué `***`). Le **jeton**, lui, est toujours un _Secret_.

3. _Actions → CI/CD → Run workflow_ sur `main`. Quand les jobs **Image Docker** et **Image Docker de l'API** sont verts,
   leurs résumés affichent les liens Docker Hub.
4. **Vérifiez que `levy2025/kemdia-api` est public** : <https://hub.docker.com/repositories/levy2025> → `kemdia-api` →
   **Settings → Visibility settings → Make public** (Docker Hub peut créer les nouveaux dépôts en privé, selon le réglage du compte).

### 2. Créer le service du site sur Render

1. Créez un compte sur <https://render.com> (gratuit, sans carte bancaire pour l'offre Free).
2. **New → Web Service → Existing Image**.
3. Image URL : `docker.io/levy2025/kemdia:latest` — **Credential : No credential** (l'image est publique).
4. Nom : `kemdia` (l'adresse sera `https://kemdia.onrender.com`, ou proche si le nom est pris). Région : **Frankfurt** (la plus proche du Gabon).
5. Instance type : **Free**.
6. **Environment variables** : `PORT` = `3000`, `APP_ENV` = `demo` et `SITE_URL` = l'adresse du service (ex. `https://kemdia.onrender.com`).
   `SITE_URL` sert aux aperçus WhatsApp / Facebook (liens absolus) ; elle est lue au démarrage, sans reconstruire l'image.
7. **Advanced → Health Check Path** : `/api/health`
8. **Deploy Web Service**. Au bout de 2–3 minutes, le site répond sur l'adresse affichée en haut de la page.
9. **Settings → Deploy Hook** : copiez l'URL (elle contient une clé secrète), et **Auto-Deploy : No** (c'est le pipeline qui décide).

### 3. Créer la base sur Neon (≈ 5 minutes)

1. Créez un compte sur <https://neon.com> (offre **Free**, sans carte bancaire).
2. **New project** : nom `kemdia-demo`, **Postgres version 18**, région **AWS Europe Central 1 (Frankfurt)** — la même que Render.
3. Sur la page du projet → **Connect** : désactivez **Connection pooling** (on veut la connexion **directe**, sans `-pooler` dans l'adresse),
   puis copiez l'adresse. Elle ressemble à :

   ```
   postgresql://neondb_owner:<mot de passe>@ep-xxxx-xxxx.eu-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
   ```

4. **Retirez `&channel_binding=require`** à la fin (gardez `?sslmode=require`) : tous les outils de l'API ne le comprennent pas.
5. Gardez cette adresse pour l'étape 4 **seulement** : elle contient un mot de passe. Jamais dans Git, un message, un ticket ou une capture.

> Pas besoin de créer les tables : l'API le fait elle-même au démarrage (migrations), puis importe le catalogue de démonstration.

### 4. Créer le service de l'API sur Render

1. Générez la **clé interne** partagée entre le site et l'API (PowerShell ou n'importe quel terminal) :

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

2. Render → **New → Web Service → Existing Image** : `docker.io/levy2025/kemdia-api:latest`, **No credential**.
3. Nom : `kemdia-api` (adresse `https://kemdia-api.onrender.com`, ou proche). Région **Frankfurt**, instance **Free**.
4. **Environment variables** :

| Nom                 | Valeur                                       | Remarque                                                          |
| ------------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `APP_ENV`           | `demo`                                       | **Obligatoire** : sans lui, le démarrage de démo est refusé       |
| `PORT`              | `4000`                                       |                                                                   |
| `DATABASE_URL`      | l'adresse Neon de l'étape 3                  | **Secret**                                                        |
| `DATABASE_POOL_MAX` | `5`                                          | Peu de connexions suffisent pour une démo                         |
| `API_INTERNAL_KEY`  | la clé générée au point 1                    | **Secret** — la même valeur ira dans le service du site           |
| `API_DOCS`          | `false` (ou `true` pour montrer `/api/docs`) | Facultatif ; désactivée par défaut, comme en production           |
| `EMAIL_TRANSPORT`   | `brevo`                                      | Envoi des codes par e-mail (S4-T02) — voir [emails.md](emails.md) |
| `BREVO_API_KEY`     | la clé d'API Brevo                           | **Secret**                                                        |
| `EMAIL_FROM`        | l'adresse d'expédition vérifiée dans Brevo   |                                                                   |

5. **Advanced** :
   - **Docker Command** : `node dist/database/start-demo.js`
     (migrations → import du catalogue de démonstration → API ; ne fonctionne qu'avec `APP_ENV=demo`) ;
   - **Health Check Path** : `/api/health`.
6. **Deploy Web Service**. Dans **Logs**, vous devez voir dans l'ordre :

   ```
   Migrations de la base : terminées, la base est à jour.
   Catalogue de démonstration importé : 112 catégories, 50 produits (… s).
   API Kemdia sha-… prête sur le port 4000 (demo)
   ```

   Puis `https://kemdia-api.onrender.com/api/health` répond `"database":"ok"`.

7. **Settings → Deploy Hook** : copiez l'URL ; **Auto-Deploy : No**.

### 5. Brancher le site sur l'API

Render → service **`kemdia`** (le site) → **Environment** → ajoutez :

| Nom                  | Valeur                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `API_URL`            | `https://kemdia-api.onrender.com` (sans `/` final)                                                 |
| `API_INTERNAL_KEY`   | **la même clé** que dans le service de l'API (secret)                                              |
| `CATALOG_TIMEOUT_MS` | `90000` (le maximum : l'API peut mettre plus d'1 min à se réveiller, migrations et import compris) |

Enregistrez : Render redémarre le site. Dans ses **Logs** : `Kemdia — catalogue : API https://kemdia-api.onrender.com (délai 90000 ms)`
puis `Kemdia — réveil de l'API : prête en … s`. Et `https://kemdia.onrender.com/api/health` contient `"catalog":"api"`.

### 6. Relier Render au pipeline GitHub

Sur GitHub → dépôt `kemdia` → **Settings → Secrets and variables → Actions** :

| Type     | Nom                          | Valeur                                                                     |
| -------- | ---------------------------- | -------------------------------------------------------------------------- |
| Secret   | `RENDER_DEPLOY_HOOK_URL`     | le deploy hook du **site** (déjà présent depuis le S1)                     |
| Secret   | `RENDER_API_DEPLOY_HOOK_URL` | le deploy hook de **l'API** (étape 4)                                      |
| Variable | `DEMO_URL`                   | l'adresse du site, ex. `https://kemdia.onrender.com` (sans `/` final)      |
| Variable | `DEMO_API_URL`               | l'adresse de l'API, ex. `https://kemdia-api.onrender.com` (sans `/` final) |

### 7. Vérifier

Fusionnez n'importe quelle PR dans `main` (ou _Actions → CI/CD → Run workflow_ sur `main`). Le job **Déploiement DÉMO (Render)** :

1. déclenche l'**API** avec le digest de son image, attend que `/api/health` renvoie la version du commit et `database: ok` ;
2. déclenche **le site**, attend sa version ;
3. contrôle la page d'accueil, les en-têtes de sécurité, une fiche produit, et que le site lit bien l'API (`catalog: "api"`).

Le résumé du job affiche l'adresse et la source du catalogue.

### 8. Créer le premier administrateur (S4-T06)

Aucun compte administrateur n'existe au départ, et aucun mot de passe par défaut : on **promeut un compte déjà inscrit**.

1. Inscris-toi normalement sur le site de démo (code reçu par e-mail).
2. Sur **ton poste**, dans un terminal, avec l'adresse de connexion Neon **complète** (tableau de bord Neon → _Connect_ →
   _Connection string_ ; elle commence par `postgresql://neondb_owner:` et contient le mot de passe). L'adresse est **collée
   quand le terminal la demande**, jamais tapée dans la commande : sinon elle resterait dans l'historique du terminal.

   ```powershell
   # Windows (PowerShell) : coller l'adresse puis Entrée (Read-Host ne l'écrit pas dans l'historique)
   $env:DATABASE_URL = Read-Host "Adresse Neon"
   pnpm --filter @kemdia/api admin:grant ton-adresse@exemple.ga
   Remove-Item Env:DATABASE_URL
   ```

   ```bash
   # Linux / macOS / Git Bash : coller l'adresse (invisible) puis Entrée
   read -rs DATABASE_URL && export DATABASE_URL
   pnpm --filter @kemdia/api admin:grant ton-adresse@exemple.ga
   unset DATABASE_URL
   ```

   La commande affiche seulement l'UUID du compte. Elle n'écrit rien dans Git ni dans Render. Ne colle jamais l'adresse dans un
   fichier suivi par Git, ni dans une conversation.

3. Pour retirer le rôle : `admin:revoke` avec la même adresse. Chaque changement est inscrit au journal d'audit.

4. Sur la démo, **déconnecte-toi puis reconnecte-toi** : « Mon compte » affiche « Ouvrir l'espace de l'équipe » (`/equipe`,
   S6-T05). La première visite ouvre la page « Sécurité » : active la double authentification (application TOTP) et range les
   10 codes de secours. Sans rôle d'équipe, `/equipe` répond 404 (voulu : l'espace ne se signale pas).

Messages possibles de la commande : « Rôle administrateur accordé… » (réussi), « Refusé : … COMPTE_INTROUVABLE » (compte pas
inscrit **sur la démo**, ou pas vérifié), « Échec… Base joignable ? » (adresse Neon incomplète ou fausse). Jusqu'au 2026-10-16,
la commande pouvait s'arrêter **sans aucun message** (correctif `fix/admin-grant-cli`).

Pour tester tout le parcours vendeur, utilise **deux comptes** : un administrateur (`/equipe`) et un vendeur (`/vendeur`) ;
personne ne valide sa propre boutique ni ses propres produits.

### 9. Adresse des visiteurs (S4-T07) — ✅ activée le 2026-10-09

Réglage en place sur le service **site** (`kemdia-1`) : `CLIENT_IP_HEADER=cf-connecting-ip`. Au démarrage, les journaux du site
affichent « adresse des visiteurs transmise à l'API : oui (cf-connecting-ip) ». Le site envoie alors l'adresse du visiteur à l'API
(limites par visiteur, journal d'audit).

**Pourquoi `CF-Connecting-IP`** : Render passe par Cloudflare, qui pose cet en-tête. **Jamais la première adresse de
`X-Forwarded-For`** : un visiteur peut l'inventer.

**Vérification faite avant l'activation** (diagnostic temporaire protégé par la clé interne, retiré au S4-T08) :

| Essai                                            | Résultat                                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Requête normale                                  | Adresse reçue = adresse réelle affichée par `ifconfig.me`                                                                                                          |
| Requête avec un faux `CF-Connecting-IP: 1.2.3.4` | **Refusée par Cloudflare** (`error code: 1000`, HTTP 403) : elle n'atteint jamais le site                                                                          |
| IPv6                                             | Sans objet (connexion sans IPv6)                                                                                                                                   |
| Second réseau                                    | Non confirmé : une seule adresse vérifiée avec la bonne clé (via un VPN, pas de forfait 4G) ; l'essai sur l'autre réseau avait échoué à cause d'une clé mal collée |

Limite : ce test montre que Cloudflare ne laisse pas passer un `CF-Connecting-IP` inventé ; il repose sur le fait que Render
n'expose pas le site hors de Cloudflare (ce qu'aucun test ne peut prouver).

**Si l'adresse semble fausse un jour** (tous les visiteurs avec la même adresse, ou limites atteintes trop vite) : **vider**
`CLIENT_IP_HEADER` sur Render. Le site cesse aussitôt de transmettre l'adresse ; les limites par compte et par identifiant restent.

### 10. Tester le premier achat (S5-T08)

Sur la démo, un bandeau « Site de démonstration : aucun vrai paiement » mène à la page **`/demo`**, qui explique le parcours :

1. créer un compte (le code arrive par e-mail) ;
2. ajouter des articles, commander à Libreville, essayer le code promo **`DEMO10`** (−10 %, 10 000 FCFA au plus, une fois par compte) ;
3. payer par Airtel Money ou Moov Money avec un numéro **fictif**, puis valider sur **`/demo/telephone`** (code PIN de 4 chiffres au choix) ;
4. suivre la commande dans « Mes commandes » et télécharger la facture PDF.

`DEMO10` est créé automatiquement au démarrage de la démo (import de démonstration). Il n'existe jamais en préproduction ni en
production. Un administrateur peut le désactiver : un redémarrage ne le réactive pas.

### 11. Vérification des vendeurs (S6-T08) — clé à ajouter

La vérification des vendeurs (pièce d'identité, compte de versement) est **chiffrée** avec une clé à part. Sans elle, la
démo affiche « vérification momentanément indisponible » : rien d'autre ne change.

1. Sur **ton poste**, génère une clé (elle ne sort pas de ton terminal) :

   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

2. Render → service **API** → _Environment_ → ajoute `KYC_ENCRYPTION_KEY` = la valeur affichée (**Secret**), puis
   enregistre (l'API redémarre). Elle doit être **différente** de `TOTP_ENCRYPTION_KEY` : sinon l'API refuse de démarrer.
3. Garde la clé dans ton gestionnaire de mots de passe : **si elle change ou se perd, les dossiers déjà envoyés ne
   se lisent plus** (il faut alors les redemander aux vendeurs). Ne la colle jamais dans Git ni dans une conversation.
4. Test : un vendeur ouvre « Vérification » dans son espace, remplit le dossier, envoie les photos ; un administrateur
   l'ouvre dans `/equipe/verifications` (double authentification confirmée).

> La démo ne se met à jour qu'après un passage de la CI sur `main`. Tant que GitHub Actions est bloqué, rien ne change sur Render.

### 12. Livraisons (S7-T02)

Rien à régler sur Render. Après la fusion : `db:deploy` puis `db:check` (nouvelles tables du schéma `shipping`).

1. Un administrateur (double authentification confirmée) ouvre **Équipe → Livraisons** : les commandes payées (ou à la
   livraison) dont tous les vendeurs sont d'accord y sont « Prêtes ».
2. « Remettre au transporteur », puis sur la fiche : « Noter la commande livrée », ou un échec (motif), puis une nouvelle
   tentative ou l'annulation. Le client reçoit un e-mail « en route » puis « livrée » (Brevo, dans la minute).
3. **Barème** : Équipe → Livraisons → Barème de livraison. Le site affiche le nouveau barème dans 5 minutes au plus ;
   le total du paiement, lui, change tout de suite.

## En cas de problème

| Symptôme                                                                           | Cause probable et solution                                                                                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Logs de l'API : `Démarrage de démonstration refusé : APP_ENV doit valoir « demo »` | Ajouter `APP_ENV=demo` dans les variables du service de l'API                                                                                                 |
| Logs de l'API : `DATABASE_URL : obligatoire en production`                         | Variable `DATABASE_URL` absente ou vide                                                                                                                       |
| Logs de l'API : `Migrations de la base : ÉCHEC`                                    | Adresse Neon fausse, `-pooler` dans l'adresse, ou projet Neon supprimé. Recopier l'adresse directe (étape 3)                                                  |
| Render : _image pull failed_ sur l'API                                             | Le dépôt Docker Hub `kemdia-api` est privé : le rendre public (étape 1.4)                                                                                     |
| Site : « Une erreur est survenue » à la première visite                            | L'API ne s'est pas réveillée en 90 s (le site patiente et réessaie depuis le S4-T08) : cliquer **Réessayer**. Vérifier `CATALOG_TIMEOUT_MS=90000` sur le site |
| Site : erreur sur toutes les pages, logs `[catalogue] … API injoignable`           | `API_URL` fausse, ou clés différentes entre le site et l'API                                                                                                  |
| CI : `Le site de démo ne lit pas l'API (catalogue : file)`                         | `API_URL` / `API_INTERNAL_KEY` absentes dans le service du site (étape 5)                                                                                     |
| CI : `The requested URL returned error: 502` juste après le déploiement            | Bascule de Render vers la nouvelle version : la CI retente 5 fois (15 s d'écart). Si ça persiste, voir les **Logs** du service                                |
| Adresse `https://kemdia.onrender.com` → « Not Found »                              | Le nom était pris : Render a donné une autre adresse (ex. `kemdia-1.onrender.com`). Mettre la bonne dans `SITE_URL` et `DEMO_URL`                             |

**Changer la clé interne** : générer une nouvelle valeur, la mettre **dans les deux services** (API puis site). **Changer le mot de passe Neon** :
Neon → **Roles → Reset password**, puis mettre la nouvelle adresse dans `DATABASE_URL` de l'API.

## Sécurité

| Point                | Mesure                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Jeton Docker Hub     | Utilisé uniquement par la CI (secret GitHub, masqué dans les journaux), expiration 90 jours, révocable sur Docker Hub |
| URL des deploy hooks | Secrets GitHub, jamais affichées dans les journaux                                                                    |
| Adresse de la base   | Uniquement dans Render (variable du service API) ; jamais affichée par l'API (ni par Prisma : `<REDACTED>`)           |
| Clé interne          | Uniquement dans Render (deux services) ; le site l'envoie en en-tête, jamais au navigateur                            |
| Images               | Mêmes images que staging/production : scannées par Trivy, utilisateur non-root, en-têtes de sécurité                  |
| Démarrage de démo    | Refusé si `APP_ENV` ≠ `demo` : impossible d'importer les données de démo ou de migrer au démarrage ailleurs           |
| Données              | Démonstration uniquement ; ne jamais brancher la future base de production sur cet environnement                      |

## Et ensuite ?

La démo sert à montrer le site. Pour la vraie production (pas de mise en veille, domaine `kemdia.ga`,
données réelles, migrations lancées **avant** l'API), suivez [deploiement.md](deploiement.md) avec un VPS (S7).
