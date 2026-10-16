# Rapport — S6-T03 : double authentification de l'équipe (MED-15)

|                                                 |                                                                    |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| **Date**                                        | 2026-10-16                                                         |
| **Sprint / tâches**                             | S6 — S6-T03                                                        |
| **Version**                                     | v0.5.0 (versions des paquets inchangées) ; contrat de l'API 1.16.0 |
| **Sections du cahier d'architecture modifiées** | §3.4, §3.7, §3.10, §3.18 (nouvelle), §6.4 — version 4.0            |

## 1. Résumé

Les **modérateurs et administrateurs** doivent maintenant confirmer leur identité avec le **code de leur application
d'authentification** (Google Authenticator, Microsoft Authenticator, Aegis…) pour utiliser une route d'équipe :
administration, coupons, réglages, remboursements, boutiques, modération. Une session volée ne suffit plus. La confirmation vaut
15 minutes, pour cette session seulement. En cas de perte du téléphone : 10 codes de secours, puis en dernier recours la commande
serveur `mfa:reset`. Les clients et les vendeurs ne sont pas concernés.

```
Membre de l'équipe ─► route d'équipe : 403 « à activer »
   └─ mot de passe ─► QR code ─► 1er code ─► 10 codes de secours (une fois) ─► session confirmée 15 min ─► route ouverte
      après 15 min : 403 « code requis » ─► code de l'application (ou de secours) ─► encore 15 min
```

## 2. Fonctionnalités livrées

| Élément                   | Ce que ça fait                                                                                              | Fichiers principaux                                |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Routes de l'utilisateur   | `GET /api/v1/auth/2fa`, `POST …/setup` (mot de passe → QR code), `…/enable`, `…/verify`, `…/recovery-codes` | `identity/interface/second-factor.controller.ts`   |
| Garde des routes d'équipe | `@Authorize(…, { secondFactor: true })` sur les 7 contrôleurs d'administration et de modération             | `identity/interface/role.guard.ts`                 |
| Codes                     | TOTP (RFC 6238) à usage unique ; 10 codes de secours (empreintes seulement)                                 | `identity/domain/totp.ts`, `second-factor.ts`      |
| Secrets                   | Chiffrés en AES-256-GCM avec `TOTP_ENCRYPTION_KEY`, liés au compte                                          | `identity/infrastructure/aes-secret-box.ts`        |
| Commande serveur          | `pnpm --filter @kemdia/api mfa:reset <e-mail>` (image : `node dist/cli/mfa-reset.js <e-mail>`)              | `src/cli/mfa-reset.ts`                             |
| Avis par e-mail           | QR code affiché, activation, code de secours utilisé, nouveaux codes, blocage, remise à zéro                | `identity/infrastructure/email/email-templates.ts` |
| Base                      | Migration `20261016100000_double_authentification` (2 tables, 1 colonne, déclencheurs)                      | `prisma/schema/identity.prisma`                    |

## 3. Décisions techniques

[ADR-0034](../architecture/adr/0034-double-authentification-equipe.md), avec tes choix du 2026-10-16 : **modérateurs + admins**,
**application TOTP**, **codes de secours + commande serveur**, **clé ajoutée par toi**.

### Ce que tu dois faire pour la clé (je n'ai touché à aucun `.env` ni à Render)

1. Générer une clé (une fois par environnement) :
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
2. La mettre en **secret** `TOTP_ENCRYPTION_KEY` sur le serveur de préproduction / production quand il existera. **Sans elle,
   les routes d'équipe restent fermées** sur ces environnements.
3. En local et en démo (Render, `en-ligne.ps1`), rien d'obligatoire : une clé de développement est utilisée (un avertissement
   s'affiche au démarrage). Tu peux quand même en définir une dans ton `.env` local si tu le souhaites.
4. Ne jamais changer la clé sans prévoir un `mfa:reset` par compte d'équipe : les secrets chiffrés avec l'ancienne deviendraient
   illisibles.

J'ai ajouté une ligne vide `TOTP_ENCRYPTION_KEY=` avec son explication dans le **modèle** `apps/api/.env.example` (le fichier de
documentation suivi par Git, pas ton `.env`).

### Repris de la session de la nuit

Les 15 fichiers nouveaux sauvés ce matin ont été repris (renumérotés S6-T03 / ADR-0034, migration redatée après celles du S6-T02).
Les modifications perdues ont été refaites : schéma Prisma, ports et sessions de l'identité, garde des routes d'équipe,
configuration, contrat partagé, avis par e-mail, câblage du module, tests existants des routes d'équipe.

## 4. Sécurité

- **Routes d'équipe** : les 7 contrôleurs sont protégés ; une règle de méthode ne peut pas affaiblir celle du contrôleur.
- **Pas de rejeu** : chaque période de 30 s ne sert qu'une fois par compte (verrou + déclencheur SQL) ; un code de secours aussi.
- **Session volée** : ne peut ni inscrire un autre téléphone (mot de passe redemandé), ni désactiver la 2FA (aucune route), ni se
  fabriquer des codes de secours (code frais de l'application exigé).
- **Secrets** : chiffrés, liés au compte ; jamais dans les réponses (sauf le QR code, `no-store`), le journal ou les e-mails.

**Relecture de sécurité indépendante** (agent séparé, avant la PR) : **aucun problème critique ni élevé** ; deux moyens, reproduits
sur la base de test, et des faibles. Corrigé :

| Gravité | Trouvé                                                                                                                                                                                            | Correction                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Moyenne | Un voleur de session pouvait essayer **2 codes par quart d'heure indéfiniment**, sans blocage, sans trace ni avis (≈ 19 % de chances sur un an) ; une réussite du titulaire remettait tout à zéro | Compteur d'échecs **sur 24 h** en base, jamais remis à zéro par une réussite : **10 échecs → toutes les sessions fermées**, avis ; chaque échec au journal (`mfa.failed`) |
| Moyenne | Après `mfa:reset`, un voleur qui connaît aussi le **mot de passe** se reconnectait et inscrivait son téléphone                                                                                    | `mfa:reset` rend le mot de passe **inutilisable** : le titulaire passe par « Mot de passe oublié » (sa boîte e-mail) ; testé de bout en bout                              |
| Faible  | `setup` révélait si un mot de passe était juste (409 au lieu de 422) sur un compte déjà protégé                                                                                                   | Refus **avant** de regarder le mot de passe, sans compter d'essai                                                                                                         |
| Faible  | Aucun avis quand un code de secours est utilisé                                                                                                                                                   | Avis « code de secours utilisé », et avis à l'affichage du QR code                                                                                                        |
| Faible  | Secret et codes de secours absents du masquage des journaux techniques                                                                                                                            | `secret`, `recoveryCodes`, `secretBox` masqués                                                                                                                            |
| Faible  | Message d'erreur qui nommait la variable de la clé                                                                                                                                                | Message neutre (« prévenez l'exploitant »)                                                                                                                                |

**Gardé et noté** (ADR-0034) : la toute première inscription d'un compte se fait avec le mot de passe seul (l'avis e-mail
prévient le titulaire) ; un blocage posé par des requêtes simultanées peut gêner le titulaire 15 minutes ; pas de rotation
automatique de la clé ; basculer toutes les instances d'un coup au déploiement ; `RECONNEXION_REQUISE` n'est plus renvoyé.

## 5. Qualité

GitHub Actions étant bloqué, tout a été lancé **en local** (espace de travail cloud, PostgreSQL 16, base `kemdia_test`) :

| Vérification                           | Résultat                                                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Format, lint, types (tout le dépôt)    | ✅                                                                                                       |
| Construction de l'API et du site       | ✅ (site construit avec une API **injoignable**, comme en CI)                                            |
| Tests unitaires de l'API               | ✅ **519** (488 avant ; +31 : TOTP, codes de secours, chiffrement, service, garde, commande serveur)     |
| Tests d'intégration (vraie base)       | ✅ **172** (166 avant ; +6 : parcours complet, rejeu, blocages, commande serveur, compteur 24 h en SQL)  |
| Tests du site / du contrat             | ✅ 280 / 30                                                                                              |
| Bout en bout (Playwright)              | Non relancés : seul un fichier de messages du site change (textes d'erreur prêts pour les futurs écrans) |
| Gitleaks v8.30.1 (empreinte vérifiée)  | ✅ (voir la PR)                                                                                          |
| `db:check` (migration ↔ schéma Prisma) | ⏳ **à lancer chez toi** (le moteur Prisma ne se télécharge pas ici)                                     |

Les tests d'intégration des routes d'équipe existants (coupons, paiements, factures, boutiques, produits) confirment maintenant la
session de leurs comptes d'équipe ; le vrai parcours (QR code, codes) est testé à part.

## 6. Captures d'écran

Aucune : pas d'écran (API seule ; les écrans de l'équipe viendront au S6).

## 7. Limites connues / dette technique

- Pas d'écran : QR code, saisie du code et codes de secours seront affichés par le back-office (S6).
- Pas encore de double authentification en option pour les vendeurs.
- Rotation de la clé : manuelle (un `mfa:reset` par compte).

## 8. Prochaines étapes

1. **Toi, avant de fusionner** : `pnpm --filter @kemdia/api db:deploy` puis `pnpm --filter @kemdia/api db:check` (port 5433).
2. **Ton compte administrateur** : à ta prochaine utilisation d'une route d'administration, active la double authentification
   (`/api/v1/auth/2fa/setup` puis `/enable`) et range tes 10 codes de secours hors du téléphone.
3. Suite du S6 (proposée) : photos des produits, KYC (BR-024), site branché (espace vendeur, écrans de l'équipe avec la double
   authentification), commandes vendeur (BR-013), commissions (question n° 3).
