# Rapport — S7-T07 : test d'intrusion (OWASP ZAP + revue ASVS 5.0 niveau 1)

|                                                 |                                      |
| ----------------------------------------------- | ------------------------------------ |
| **Date**                                        | 2026-10-19                           |
| **Sprint / tâches**                             | S7 — S7-T07                          |
| **Version**                                     | v0.7.0 → (v0.8.0 à la clôture du S7) |
| **Sections du cahier d'architecture modifiées** | §3.7, §6, §7 — version 4.13          |

## 1. Résumé

**OWASP ZAP** attaque maintenant Kemdia en fonctionnement, dans la CI. Il scanne la pile du serveur montée comme sur
le VPS, en quatre rôles (anonyme, client, vendeuse, administratrice), sur le site et sur chaque route de l'API. Le
scan est passif à chaque PR et actif chaque dimanche ; un risque moyen ou élevé bloque.

La **revue OWASP ASVS 5.0 niveau 1** (70 exigences, chacune avec sa preuve) a trouvé cinq écarts, tous corrigés :

- on peut enfin **changer son mot de passe** en donnant l'actuel ;
- **10 000 mots de passe courants** sont refusés ;
- la règle « une lettre et un chiffre » est **retirée** ;
- les **délais de correction des dépendances** sont écrits.

## 2. Fonctionnalités livrées

| Élément                    | Description                                                                                                                                                                             | Fichiers                                                                   |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Test d'intrusion ZAP       | ZAP 2.17.0 (somme vérifiée) ; site (exploration en HTTPS via Caddy) et API (97 adresses OpenAPI) ; 4 rôles ; passif PR, actif dimanche ; moyen ou élevé = rouge ; résumé et annotations | `.github/workflows/zap.yml`, `.github/zap/`                                |
| Pile serveur partagée      | Même montage pour « Pile serveur » et ZAP (images, fichiers du serveur, Caddy, déploiement)                                                                                             | `.github/actions/pile-serveur/action.yml`                                  |
| Changer son mot de passe   | `POST /api/v1/auth/password/change` + formulaire dans « Mon compte » ; 3 erreurs → blocage 15 min et session fermée ; nouvelle session, avis, journal d'audit ; contrat 1.22.0          | `password-change.service.ts`, `ChangePasswordForm.tsx`                     |
| Politique de mots de passe | 8 à 128 caractères, sans règle de composition ; 10 000 courants refusés (SecLists, MIT), liste reproductible                                                                            | `password-policy.ts`, `common-passwords.ts`, `scripts/common-passwords.py` |
| Revue ASVS 5.0 niveau 1    | 70 exigences : 53 ✅, 5 🔧, 12 ➖                                                                                                                                                       | `docs/securite/asvs-5.0-niveau1.md`                                        |
| Politique des dépendances  | Critique 7 j, élevée 30 j, moyenne et faible : sprint suivant ; Dependabot traité dans la semaine                                                                                       | `docs/securite/politique-dependances.md`                                   |

## 3. Décisions techniques

- [ADR-0046](../architecture/adr/0046-test-intrusion-zap-asvs.md). Choix du 2026-10-19 : les recommandations sur toute
  la ligne (scan, rôles, blocage, ASVS 5.0, quatre écarts).
- **Sessions de test** préparées dans la base éphémère de la CI (garde-fou `kemdia.e2e`), car la double
  authentification de l'équipe empêche la connexion par formulaire. Les jetons passent par les variables de ZAP :
  jamais dans le plan ni dans les rapports.
- Constats faits en essayant ZAP en local avant de toucher la CI :
  - une règle « replacer » du plan n'interprète pas les variables d'environnement ;
  - ZAP garde ses réglages d'un passage à l'autre, d'où un dossier neuf à chaque passage ;
  - Java n'envoie pas de SNI pour `localhost` : la CI ajoute `default_sni` à sa copie du Caddyfile ;
  - un filtre d'alertes doit précéder l'exploration.

## 4. Sécurité

### Résultats de ZAP (scan passif)

- **API** (4 rôles) : aucune alerte moyenne ni élevée.
- **Site** (4 rôles) : deux alertes moyennes, aucune élevée. Elles sont traitées comme des exceptions justifiées dans
  `plan.py` :

| Alerte                                  | Décision                                                                                                                                            |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSP `style-src 'unsafe-inline'` (10055) | **Risque accepté** (choix du 2026-10-09, ADR-0021) : attributs `style` de React, aucun code exécutable par un style ; scripts verrouillés par nonce |
| Absence of Anti-CSRF Tokens (10202)     | **Faux positif** : actions serveur protégées par `Origin` / `Sec-Fetch-Site` et `SameSite=Lax` (ASVS 5.0 V3.5.1)                                    |

Avant chaque scan, la CI vérifie aussi le contrôle d'accès de l'équipe : 200 pour l'administratrice, 403 pour le
client et la vendeuse, refus sans session.

### Relecture indépendante (agent séparé, avant la PR) : 0 grave, 2 moyennes, 5 faibles

| Constat                                                                                                   | Correction                                                                                                    |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Moyen : le scan actif pouvait perdre ses sessions (essais comptés) et finir en anonyme sans le dire       | Routes à essais comptés exclues ; sessions **revérifiées après le scan** (CI rouge sinon)                     |
| Moyen : rapports du scan actif téléchargeables par tous (dépôt public) avant correction                   | Rapports publiés seulement pour une PR (scan passif) ; scan actif : résumé seulement ; niveau « info » retiré |
| Faible : blocage causé par un autre → ce navigateur déconnecté à tort                                     | Cookie effacé seulement si l'API refuse vraiment la session                                                   |
| Faible : « déconnecter tous mes appareils » pendant le hachage n'arrêtait pas le changement               | Session présentée revérifiée dans la transaction                                                              |
| Faible : `default_sni` ajouté à la production pour un besoin de test                                      | Retiré du dépôt ; ajouté seulement à la copie de test de la CI                                                |
| Faible : mises à jour de ZAP possibles pendant le scan ; un lancement manuel annulait le scan du dimanche | Mode `-silent` ; concurrence par événement                                                                    |
| Faible : trois preuves de la revue ASVS imprécises (V1.2.4, V6.2.8, V8.2.1)                               | Corrigées                                                                                                     |

Confirmé sans problème par la relecture :

- aucun contournement d'authentification, aucune énumération, aucune fixation de session ;
- essais réservés avant la vérification ;
- aucune injection dans le workflow ; somme de ZAP conforme ;
- liste de mots de passe sans risque pour le gabarit.

## 5. Qualité

- API : 4 tests HTTP du changement de mot de passe :
  - réussite : sessions fermées, nouvelle session, avis et journal ;
  - sans session ; mot de passe faible ou courant, sans essai consommé ;
  - blocage au 3e essai, session fermée, connexion du titulaire intacte, déblocage après 15 min ;
  - corps invalide.
- API : politique (sans composition, liste de 10 000, mot de passe tel quel) ; 175 tests du module identité au vert.
- Site : validation sans composition ; parcours de bout en bout :
  - mauvais mot de passe actuel ;
  - changement ;
  - toujours connecté ;
  - e-mail de confirmation.
- ZAP essayé en local (2.17.0) avant la CI :
  - injection de la session ;
  - exclusions respectées ;
  - code de sortie selon le seuil ;
  - filtres d'exception.
- ShellCheck, format, lint, types ; Gitleaks et Semgrep : voir la PR.
- Aucune migration de base ; aucun réglage Render ni fichier `.env` modifié.

## 6. Captures d'écran

Sans objet (le formulaire suit le style des formulaires existants ; vérifié par le test de bout en bout).

## 7. Limites connues / dette technique

- Le premier **scan actif** tournera dimanche, ou à la demande depuis `main` (_Actions → Test d'intrusion (ZAP) → Run
  workflow_). Ses résultats sont à traiter comme une PR.
- Les mots de passe déjà enregistrés et présents dans la liste restent valables jusqu'au prochain changement.
- Le compteur d'essais du changement n'a pas de plafond sur 24 heures (contrairement à la double authentification).
  Le blocage de 15 minutes et la fermeture de la session suffisent au niveau 1.
- Le test d'intrusion externe payant reste à proposer au client avant le lancement.

## 8. Prochaines étapes

- Fusionner, puis lancer un scan actif à la demande pour avoir le premier résultat sans attendre dimanche.
- S7-T08 : conformité (APDPVP, données personnelles).
