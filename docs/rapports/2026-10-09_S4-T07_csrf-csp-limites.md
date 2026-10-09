# Rapport — S4-T07 : CSRF, CSP à nonce, limites par visiteur et par compte

|                                                 |                                                        |
| ----------------------------------------------- | ------------------------------------------------------ |
| **Date**                                        | 2026-10-09                                             |
| **Sprint / tâches**                             | S4 — S4-T07                                            |
| **Version**                                     | v0.4.0 (en cours) — contrat de l'API 1.6.0             |
| **Sections du cahier d'architecture modifiées** | §3.7, §5.2, §5.4, §5.9, §6.2, §6.3, §6.4 (version 2.7) |

## 1. Résumé

Trois protections posées entre le navigateur, le site et l'API :

- **CSRF** : une requête qui modifie quelque chose doit venir du site lui-même. Un autre site ne peut plus faire agir un client
  connecté à son insu.
- **CSP à nonce** : seuls les scripts du site s'exécutent. Un script injecté par une faille serait bloqué par le navigateur.
- **Limites par visiteur et par compte** : l'API peut maintenant limiter chaque visiteur, et chaque compte, même quand c'est le site
  qui l'appelle. Le journal d'audit peut enregistrer la vraie adresse du visiteur.

## 2. Fonctionnalités livrées

| Élément             | Ce que ça fait                                                                                                                       | Fichiers principaux                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Contrôle d'origine  | Toute requête POST/PUT/DELETE sans `Origin` du site, ou signalée « venue d'ailleurs » par le navigateur → 403, sur **toute** adresse | `apps/web/src/proxy.ts`, `lib/security/origin.ts`   |
| CSP à nonce         | Nonce neuf à chaque page ; `script-src 'nonce-…' 'strict-dynamic'` ; plus de `'unsafe-inline'` pour les scripts                      | `proxy.ts`, `lib/security/csp.ts`, `app/layout.tsx` |
| Adresse du visiteur | Réglage `CLIENT_IP_HEADER` (vide par défaut) ; adresse transmise à l'API dans `X-Kemdia-Client-IP`                                   | `lib/security/client-ip.ts`, `lib/auth/session.ts`  |
| Visiteur côté API   | En-tête cru **seulement** avec la clé interne ; limites par adresse appliquées au visiteur (×3), IPv6 par /64                        | `apps/api/src/http/client.ts`, `rate-limit.ts`      |
| Limites par compte  | 120/min par route connectée ; « tous mes appareils » 5/min ; administration 30/min ; `@AccountRateLimit(n)` réutilisable             | `identity/interface/session.guard.ts`               |
| Journal d'audit     | Adresse du visiteur enregistrée quand le site la transmet                                                                            | `audit/interface/request-context.ts`                |
| Contrat 1.6.0       | Code `TROP_DE_REQUETES` (429 + `Retry-After`) ; en-tête `X-Kemdia-Client-IP`                                                         | `packages/contracts`, `docs/api/openapi.json`       |

## 3. Décisions techniques

[ADR-0021](../architecture/adr/0021-csrf-csp-limites.md), avec tes choix du 2026-10-09 :

| Question            | Ton choix                                                   |
| ------------------- | ----------------------------------------------------------- |
| CSP                 | Scripts à nonce, styles inchangés                           |
| CSRF                | Contrôle d'origine strict (sans jeton dans les formulaires) |
| Adresse du visiteur | Réglage du site, désactivé par défaut                       |
| Compteurs           | Mémoire de l'API (une seule instance au MVP)                |

À savoir :

- **Toutes les pages sont maintenant calculées à la demande** : c'est obligatoire pour qu'une page porte le nonce de sa requête
  (documentation de Next.js 16). Le budget de performance reste mesuré à chaque PR.
- **Aucun réglage `.env` ni Render n'a été changé.** `apps/web/.env.example` (modèle dans Git, sans secret) documente la nouvelle
  variable `CLIENT_IP_HEADER`. L'activer sur la démo est une étape **à faire avec ton accord** (guide de la démo, étape 9).

## 4. Sécurité

- **HIGH-16** (CSRF) et **MED-05** (pas de limitation) de l'ancien projet : **fermés**. **LOW-03** (CSP) renforcé.
- Le trou de Next.js (une action serveur **sans** en-tête `Origin` passait) est fermé et testé, jusqu'au navigateur réel en CI.
- L'adresse transmise par le site n'est crue **qu'avec la clé interne** : un appelant direct ne peut pas se faire passer pour un autre.
- **Relecture de sécurité indépendante** (agent séparé, avant la PR). Corrigé :
  1. **(Haut)** le contrôle d'origine ne couvrait pas les adresses exclues du proxy (images, `favicon.ico`, aperçus) : une action serveur
     sans origine y était encore exécutée → le proxy couvre maintenant **toutes** les adresses sauf les fichiers de construction ; testé ;
  2. **(Moyen)** ces mêmes adresses pouvaient renvoyer une page HTML **sans CSP** → corrigé par le même changement ;
  3. **(Moyen)** en IPv6, changer d'adresse dans son bloc contournait la limite → compteurs regroupés par **/64** ; testé ;
  4. **(Moyen)** beaucoup d'abonnés mobiles partagent une adresse (CGNAT) → limites **×3** pour les visiteurs transmis par le site,
     et code `TROP_DE_REQUETES` sur toutes les réponses 429 (le site distingue une limite d'une panne) ;
  5. **(Bas)** une adresse IPv6 avec « zone » (`%eth0`) faisait échouer l'écriture au journal → refusée ;
  6. **(Bas)** une adresse illisible levait la limite → compteur commun « inconnue », jamais d'exemption ;
  7. **(Bas)** le test de bout en bout de la CSP couvre aussi une fiche produit et une page 404.
- Point noté par la relecture, mesuré par la CI : passage de toutes les pages en rendu à la demande (budget de performance).

## 5. Qualité

| Vérification                                 | Résultat                                                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests de l'API (sans base)                   | 354 réussis, dont limites par visiteur (IPv4, IPv6 /64), par compte, en-tête sans clé ignoré                                                                                          |
| Tests d'intégration (vraie PostgreSQL)       | 69 réussis                                                                                                                                                                            |
| Tests du site                                | 208 réussis, dont contrôle d'origine, nonce, couverture du proxy, adresse du visiteur                                                                                                 |
| Tests du contrat                             | 12 réussis                                                                                                                                                                            |
| `typecheck`, `lint`, `build`                 | OK ; toutes les pages en rendu à la demande                                                                                                                                           |
| Essai réel (API + site construits, en local) | Tous les scripts portent le nonce ; POST sans origine → 403 sur `/connexion`, `/favicon.ico`, `/images/…`, aperçus ; 30 connexions puis 429 pour un visiteur, un autre visiteur passe |
| Bout en bout (CI)                            | Nonce sur 5 pages, CSRF sur 4 adresses (voir la PR)                                                                                                                                   |

## 6. Captures d'écran

Aucun changement visible : les protections sont invisibles pour un client normal.

## 7. Limites connues / dette technique

- **Démo** : `CLIENT_IP_HEADER` reste vide tant que l'en-tête fiable de Render n'est pas vérifié (je n'ai pas trouvé de documentation
  officielle sûre). D'ici là, l'API applique ses limites par compte et par identifiant, et le journal garde l'adresse du serveur du site.
- **Compteurs en mémoire** : remis à zéro à chaque redémarrage de l'API ; Redis quand il y aura plusieurs instances (S7).
- **Pas de collecte des violations de CSP** (`report-to`) : un script légitime bloqué ne se verrait que par un test ou un client.
- **Rendu à la demande partout** : plus de page pré-générée ; à surveiller sur Render gratuit.
- Un navigateur très ancien qui n'envoie pas `Origin` sur un formulaire (Firefox < 70) ne peut plus rien envoyer.

## 8. Prochaines étapes

- **S4-T08** : démo et dette (page « la boutique se réveille », suppression des colonnes `failed_logins` / `locked_until`),
  clôture du sprint (v0.4.0).
- Avec ton accord : vérifier l'en-tête de Render et régler `CLIENT_IP_HEADER` sur la démo.

## 9. Complément — vérification de l'adresse des visiteurs sur la démo (2026-10-09)

Avec ton accord, préparation de l'activation de `CLIENT_IP_HEADER` sur la démo, avec tes conditions :

- **Candidat : `CF-Connecting-IP`** (Render passe par Cloudflare) ; jamais la première valeur de `X-Forwarded-For`.
- **Diagnostic temporaire** `GET /api/diagnostic-ip` sur le site : protégé par la clé interne (404 sinon), ne renvoie **que**
  `CF-Connecting-IP` et l'adresse que le site en retiendrait, rien n'est journalisé, jamais mis en cache.
  **Supprimé au S4-T08.**
- Procédure de vérification (vraie adresse, fausse valeur `1.2.3.4`, Wi-Fi puis 4G) et variable exacte à ajouter :
  [guide de la démo, étape 9](../guides/demo-gratuite.md).
- Production sur VPS : le relais de confiance sera **Caddy**, pas Cloudflare (`x-forwarded-for`, dernière adresse) :
  [guide de déploiement](../guides/deploiement.md).
- Relecture de sécurité indépendante du diagnostic avant la PR : aucune faille critique ni élevée. Corrigé : test en IPv4 **et**
  IPv6 avec l'adresse lue par le même moyen (`ifconfig.me`), fausse adresse IPv6 testée aussi ; clé passée à `curl` par son entrée
  (invisible dans la liste des processus) ; autres méthodes HTTP → même 404 ; guide de production complété (IPv6 dans Docker,
  pare-feu `DOCKER-USER`). Noté : la clé utilisée est la clé interne principale — raison de plus pour supprimer la route au S4-T08.
