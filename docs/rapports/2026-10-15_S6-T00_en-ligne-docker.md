# Rapport — S6-T00 : Kemdia en ligne depuis Docker Desktop (tunnel Cloudflare)

|                                                 |                                              |
| ----------------------------------------------- | -------------------------------------------- |
| **Date**                                        | 2026-10-15                                   |
| **Sprint / tâches**                             | S6 — S6-T00                                  |
| **Version**                                     | v0.5.0 (aucun changement de code applicatif) |
| **Sections du cahier d'architecture modifiées** | §8.1 (nouvelle) — version 3.7                |

## 1. Résumé

Tu peux maintenant **faire tester Kemdia à distance depuis ton PC**, comme pour SIGED : un script lance tout dans Docker Desktop
et donne une adresse `https://….trycloudflare.com` à partager ; un autre coupe l'accès. C'est la même démo que Render
(catalogue, `DEMO10`, Mobile Money simulé, aucun vrai paiement), avec une base à part et de vrais e-mails (Brevo). Pas besoin de
GitHub Actions ni de rendre le dépôt public.

```powershell
cd D:\React\kemdia
git pull
powershell -ExecutionPolicy Bypass -File deploy\windows\en-ligne.ps1     # → Kemdia est en ligne : https://….trycloudflare.com
powershell -ExecutionPolicy Bypass -File deploy\windows\hors-ligne.ps1   # coupe l'accès public (données gardées)
```

## 2. Fonctionnalités livrées

| Élément       | Ce que ça fait                                                                                                                        | Fichier                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Mode en ligne | Site, API (`APP_ENV=demo`) et base à part, construits sur ton PC ; seul le site passe par le tunnel ; site aussi sur `localhost:3100` | `deploy/en-ligne/compose.yml`    |
| Mise en ligne | Vérifie Docker, lit Brevo dans `.env` (sans l'écrire), ouvre le tunnel, démarre, vérifie par Internet, copie l'adresse                | `deploy/windows/en-ligne.ps1`    |
| Coupure       | Tunnel fermé d'abord, puis le reste ; `-Effacer` supprime la base des testeurs                                                        | `deploy/windows/hors-ligne.ps1`  |
| Guide         | Pas à pas, bon à savoir, problèmes courants                                                                                           | `docs/guides/en-ligne-docker.md` |

## 3. Décisions techniques

[ADR-0031](../architecture/adr/0031-en-ligne-docker-tunnel.md), avec tes choix du 2026-10-15 : **Brevo** (vrais e-mails),
**base séparée**, **tunnel rapide sans compte**, identifiant **S6-T00**.

- **Avant le premier lancement, à faire toi-même** : ajouter `EMAIL_FROM` et une clé Brevo dans `D:\React\kemdia\.env`. Une clé
  dédiée `EN_LIGNE_BREVO_API_KEY` est conseillée, sinon `BREVO_API_KEY` sert. **Je n'ai pas touché à ton `.env`** ni à Render.
- Aucun changement de l'application, aucune migration.

## 4. Sécurité

- **Une seule porte** : le tunnel ne joint que le site (réseau `edge`). L'API et la base sont sur un réseau à part, sans port publié.
  Le site n'écoute que sur `127.0.0.1` (pas depuis le Wi-Fi).
- **Le tunnel ne revient jamais tout seul** après un redémarrage du PC ou de Docker.
- **Secrets** : clé interne neuve à chaque lancement ; mot de passe de la base hors du dépôt (`%LOCALAPPDATA%`) ; variables
  effacées à la sortie du script ; `.env` seulement lu.

**Relecture de sécurité indépendante** (agent séparé, avant la PR) : aucun problème critique ni élevé. Corrigé :

| Gravité | Trouvé                                                                                                                                               | Correction                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Moyen   | L'adresse était cherchée dans **tous** les journaux du tunnel : ancienne adresse d'un lancement précédent, ou `api.trycloudflare.com` en cas d'échec | Tunnel **recréé** à chaque lancement ; seule la ligne d'annonce compte ; `api.` exclu ; tunnel arrêté détecté |
| Moyen   | Inscriptions et e-mails ouverts à quiconque a l'adresse, sur le même quota Brevo que Render                                                          | Clé dédiée possible (`EN_LIGNE_BREVO_API_KEY`) ; consignes dans le guide (adresse en privé, couper après)     |
| Faible  | Secrets restés dans une console PowerShell déjà ouverte                                                                                              | Variables remises comme avant à la sortie, dossier courant rendu                                              |
| Faible  | Le tunnel pouvait joindre l'API et la base                                                                                                           | Réseaux `edge` et `backend` séparés                                                                           |
| Faible  | Image cloudflared épinglée par version seulement                                                                                                     | Épinglée aussi par empreinte (`sha256`)                                                                       |
| Faible  | `-Effacer` pouvait supprimer le mot de passe sans supprimer la base                                                                                  | Mot de passe supprimé seulement si la base l'est                                                              |
| Faible  | Lecture approximative du `.env` (commentaires, `export`, doublons)                                                                                   | Lu comme dotenv                                                                                               |

Gardé et noté : secrets visibles par `docker inspect` (accès à Docker Desktop = administrateur du PC) ; pas de durée maximale du
tunnel (rappel dans le script et le guide).

## 5. Qualité

| Vérification                          | Résultat                                                                                                                                                                                                                                                             |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose config`               | ✅ ; sans le script, arrêt avec « lancer deploy\windows\en-ligne.ps1 »                                                                                                                                                                                               |
| Analyse des scripts (PowerShell 7)    | ✅ aucune erreur de syntaxe                                                                                                                                                                                                                                          |
| Scripts rejoués avec un faux `docker` | ✅ sans `.env` → arrêt clair ; lancement complet ; adresse de l'API Cloudflare ignorée ; tunnel arrêté → arrêt ; `.env` avec commentaires, `export`, guillemets, doublon ; clé dédiée prioritaire ; console propre après coup ; `hors-ligne` avec et sans `-Effacer` |
| Format, Gitleaks                      | ✅                                                                                                                                                                                                                                                                   |

**Non testé ici** : un vrai lancement Docker et le vrai tunnel (pas de moteur Docker ni d'accès à `trycloudflare.com` dans mon
espace de travail). Les briques sont celles déjà testées (images de production, `start-demo`, `APP_ENV=demo` : 65 tests de bout en
bout au S5-T08). **Premier lancement chez toi** : te connecter par l'adresse du tunnel, pour confirmer le contrôle d'origine (CSRF)
derrière Cloudflare.

## 6. Captures d'écran

Aucune : rien de nouveau à l'écran (le site en ligne est la démo du S5-T08).

## 7. Limites connues / dette technique

- Le PC doit rester allumé et éveillé ; l'adresse change à chaque lancement.
- Les données personnelles des testeurs sont sur ton PC : `-Effacer` à la fin des tests.

## 8. Prochaines étapes

- Fusionner la PR, ajouter les clés Brevo dans `.env`, lancer `en-ligne.ps1`, te connecter par l'adresse du tunnel, puis envoyer
  l'adresse (`/demo`) à tes testeurs.
- **Sprint 6** : module `vendors` et back-office (questions de choix au début de S6-T01).
