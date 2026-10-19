# ADR-0046 — Test d'intrusion : OWASP ZAP dans la CI et revue ASVS 5.0 niveau 1

- **Statut** : Accepté
- **Date** : 2026-10-19
- **Tâche** : S7-T07
- **Complète** : [ADR-0021](0021-csrf-csp-limites.md) (CSRF, CSP, limites), [ADR-0043](0043-serveur-pile-complete.md)
  (pile du serveur)

## Contexte

Le découpage du S7 a choisi un test d'intrusion gratuit : OWASP ZAP dans la CI et revue OWASP ASVS de niveau 1. Un
test d'intrusion externe payant sera proposé au client avant le lancement. Jusqu'ici, la sécurité reposait sur :

- les tests de chaque module ;
- Semgrep, CodeQL et Gitleaks ;
- des relectures de code.

Aucun outil n'attaquait le site **en fonctionnement**, et aucune grille ne vérifiait l'ensemble.

Choix du propriétaire (2026-10-19) :

| Question               | Choix                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| Scan ZAP               | **Passif à chaque PR, actif chaque semaine** (et à la demande)                           |
| Espaces connectés      | **Oui**, avec les comptes de test client, vendeuse et administratrice                    |
| Blocage                | **Risque moyen ou élevé = CI rouge** ; exceptions justifiées par écrit, relues en PR     |
| Grille                 | **ASVS 5.0** (mai 2025), niveau 1                                                        |
| Écarts ASVS (V6.2.4–5) | **Retirer la règle de composition** ; **10 000 mots de passe courants** côté API         |
| Écarts ASVS (V6.2.2–3) | **Ajouter maintenant** le changement de mot de passe avec l'actuel                       |
| Écart ASVS (V15.1.1)   | Délais de correction : **critique 7 j, élevée 30 j, moyenne et faible : sprint suivant** |

## Décision

1. **Workflow `zap.yml`.** Il scanne la pile du serveur montée comme sur le VPS (Caddy, site, API, PostgreSQL), grâce
   à l'action partagée `.github/actions/pile-serveur`, reprise aussi par le job « Pile serveur ».
   - Deux cibles : le **site** (exploration depuis l'accueil, à travers Caddy, en HTTPS) et l'**API** (les 97 adresses
     du document OpenAPI).
   - Quatre rôles chacune : anonyme, client, vendeuse, administratrice.
   - Passif sur chaque PR ; actif chaque dimanche et à la demande.
   - Rapports HTML et JSON gardés 30 jours ; résumé et annotations dans GitHub.
2. **ZAP 2.17.0** est téléchargé depuis GitHub, avec la somme SHA-256 publiée par le projet ZAP. On évite ainsi une
   image dont l'étiquette ne pouvait pas être vérifiée. Le plan (Automation Framework) est produit par
   `.github/zap/plan.py`. On en exclut ce qui fermerait la session du scan : déconnexion, double authentification,
   rôles.
3. **Sessions de test.** Elles ne vivent que dans la base éphémère de la CI (`.github/zap/sessions.sql`), avec le même
   garde-fou que les données de bout en bout (`kemdia.e2e`). Les jetons sont tirés à chaque passage ; seule leur
   empreinte est en base. Ils passent à ZAP par ses variables `ZAP_AUTH_HEADER*` : jamais dans le plan, les rapports
   ni la liste des processus (vérifié en local). Avant le scan, la CI vérifie le contrôle d'accès de l'équipe : 200
   pour l'administratrice, 403 pour le client et la vendeuse, refus sans session. Dans cette pile de test seulement,
   la limite de débit de l'API est relevée, sinon ZAP ne recevrait que des 429 ; elle est testée ailleurs.
4. **Caddy `default_sni`, dans la CI seulement.** ZAP (Java) n'envoie pas de nom de serveur (SNI) pour `localhost`.
   Sans lui, Caddy coupe la connexion. La CI ajoute `default_sni` à SA copie du Caddyfile ; celui du dépôt, donc
   celui du serveur, ne change pas (relecture S7-T07 : ne pas élargir la production pour un besoin de test).
5. **Exceptions** (dans `plan.py`, appliquées avant l'exploration) :
   - CSP `style-src 'unsafe-inline'` (règle 10055) : **risque accepté** (choix du 2026-10-09, ADR-0021) ; ramené à
     « Info » ;
   - « Absence of Anti-CSRF Tokens » (règle 10202) : **faux positif**. Les formulaires sont des actions serveur
     protégées par la vérification `Origin` / `Sec-Fetch-Site` et `SameSite=Lax` (ASVS V3.5.1).
6. **Revue ASVS 5.0 niveau 1** (`docs/securite/asvs-5.0-niveau1.md`) : 70 exigences, chacune avec sa preuve dans le
   dépôt. Cinq écarts corrigés :
   - aucune règle de composition du mot de passe ;
   - 10 000 mots de passe courants refusés (SecLists, MIT) ;
   - `POST /auth/password/change` avec le mot de passe actuel. Au 3ᵉ échec : blocage de 15 minutes et session fermée,
     sur un compteur à part (un voleur de session ne bloque pas la connexion du titulaire). En cas de réussite :
     toutes les sessions fermées, nouvelle session, journal d'audit et avis au titulaire ;
   - politique de mise à jour des dépendances (`docs/securite/politique-dependances.md`).

## Conséquences

- Chaque PR prend environ 15 minutes de CI en plus, en parallèle (deux jobs). C'est gratuit, car le dépôt est public.
- Une alerte moyenne ou élevée bloque la fusion. On la corrige, ou on la justifie dans `plan.py` et le rapport.
- Le scan actif hebdomadaire peut modifier la base de test (champs remplis au hasard) : elle est jetée à la fin.
- Contrat de l'API 1.22.0 (nouvelle route).
- Les mots de passe déjà enregistrés restent valables, même s'ils sont dans la liste : la règle s'applique au prochain
  changement.

## Alternatives écartées

- **Image Docker de ZAP** : étiquette non vérifiable depuis le poste de travail, et plus lourde. Le paquet officiel,
  avec sa somme de contrôle, fait la même chose.
- **Scan actif à chaque PR** : 30 à 60 minutes de plus par PR.
- **Connexion par formulaire dans ZAP** : la double authentification de l'équipe l'empêche. Des sessions préparées en
  base éphémère sont plus fiables.
- **Garder la règle « une lettre et un chiffre »** : contraire à ASVS 5.0 et au NIST ; elle pousse vers « Motdepasse1 ».
