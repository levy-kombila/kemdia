# ADR-0031 — Kemdia en ligne depuis le PC du développeur (Docker Desktop + tunnel Cloudflare)

- **Statut** : Accepté
- **Date** : 2026-10-15
- **Tâche** : S6-T00
- **Complète** : [ADR-0013](0013-demo-render-api-neon.md) (démo Render), [ADR-0030](0030-demo-premier-achat-ci-allegee.md) (démo du premier achat)

## Contexte

La démo Render se met à jour par la CI, bloquée pour l'instant (facturation GitHub Actions), et le dépôt doit rester privé.
Le propriétaire veut pourtant faire tester le premier achat à distance. Son autre projet (SIGED) utilise déjà avec succès un
tunnel Cloudflare lancé depuis Docker Desktop, avec deux scripts PowerShell.

Choix du propriétaire (2026-10-15) :

| Question                         | Choix                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------- |
| Codes d'inscription des testeurs | **Brevo, vrais e-mails** (clés lues dans `.env`, jamais écrites)              |
| Base de données                  | **Base séparée** (volume `kemdia-en-ligne-db`)                                |
| Tunnel                           | **Rapide, sans compte** (`trycloudflare.com`, adresse nouvelle à chaque fois) |
| Identifiant                      | **S6-T00** (préparation du Sprint 6)                                          |

## Décision

| Sujet               | Choix                                                                                                                                                                                                                                                                  | Raison                                                                                 |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Fichiers            | `deploy/en-ligne/compose.yml` (projet `kemdia-en-ligne`), `deploy/windows/en-ligne.ps1` et `hors-ligne.ps1` (Windows PowerShell 5.1, UTF-8 avec BOM, fins de ligne Windows)                                                                                            | Même usage que SIGED ; séparé du `docker-compose.yml` de développement                 |
| Comportement        | Images de production construites sur le PC, `APP_ENV=demo` : `start-demo` (migrations, catalogue, `DEMO10`), Mobile Money simulé, bandeau et `/demo`, `robots.txt` fermé                                                                                               | La même démo que Render, sans CI ni hébergeur                                          |
| Réseau              | Seul le site est publié, sur `127.0.0.1:3100` ; réseau `edge` (tunnel, site) et `backend` (site, API, base) : le tunnel ne joint ni l'API ni la base                                                                                                                   | Une seule porte d'entrée, et pas depuis le Wi-Fi                                       |
| Tunnel              | `cloudflare/cloudflared:2026.10.0` épinglé par empreinte ; conteneur **recréé** à chaque lancement ; adresse lue sur la ligne d'annonce (jamais `api.trycloudflare.com`) ; **jamais relancé tout seul** (`restart: "no"`)                                              | Pas d'adresse périmée ni injectée ; un redémarrage du PC ne remet pas le site en ligne |
| Adresse du visiteur | `CLIENT_IP_HEADER=cf-connecting-ip` (posé par Cloudflare)                                                                                                                                                                                                              | Limites par visiteur et journal d'audit justes                                         |
| Secrets             | Clé interne neuve à chaque lancement (jamais écrite) ; mot de passe de la base tiré au hasard, gardé dans `%LOCALAPPDATA%\Kemdia\en-ligne\` (hors dépôt) ; clés Brevo lues dans `.env`, `EN_LIGNE_BREVO_API_KEY` conseillée ; variables effacées à la sortie du script | Aucun secret dans Git ni dans la console après coup                                    |
| Arrêt               | `hors-ligne.ps1` : tunnel coupé **d'abord**, puis le reste ; données gardées ; `-Effacer` supprime la base, puis son mot de passe seulement si la suppression a réussi                                                                                                 | Couper l'accès public est immédiat et sûr                                              |
| Vérification        | `/api/health` par le tunnel avant d'annoncer « en ligne » ; tunnel arrêté détecté                                                                                                                                                                                      | Le propriétaire ne partage pas une adresse morte                                       |

## Conséquences

- ➕ Tests à distance possibles tout de suite, gratuitement, dépôt privé, sans GitHub Actions.
- ➖ Le PC doit rester allumé (et éveillé) pendant les tests ; l'adresse change à chaque lancement.
- ➖ Quiconque a l'adresse peut créer un compte et déclencher des e-mails Brevo (même surface que la démo Render) : adresse à partager en privé, tunnel coupé après les tests, clé Brevo dédiée conseillée.
- ➖ Les données personnelles des testeurs sont sur le PC : `-Effacer` à la fin d'une campagne.
- ➖ Le comportement du contrôle d'origine (CSRF) derrière cloudflared dépend de l'en-tête `Host` transmis par le tunnel : à confirmer au premier lancement réel (se connecter par l'adresse du tunnel).

## Gardé tel quel (relecture de sécurité)

- Secrets visibles par `docker inspect` (avoir accès à Docker Desktop équivaut déjà à administrer le PC).
- Pas de durée maximale d'ouverture du tunnel : rappelée par le script et le guide.
