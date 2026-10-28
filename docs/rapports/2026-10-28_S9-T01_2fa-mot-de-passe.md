# Rapport — S9-T01 : double authentification, étape du mot de passe expliquée

|                                                 |                                                |
| ----------------------------------------------- | ---------------------------------------------- |
| **Date**                                        | 2026-10-28                                     |
| **Sprint / tâches**                             | S9 — S9-T01 (retour du propriétaire)           |
| **Version**                                     | v0.9.0 → (v1.0.0 au lancement) ; contrat 2.8.1 |
| **Sections du cahier d'architecture modifiées** | §3.39 (nouvelle) — version 4.36                |

## 1. Résumé

Sur la page « Sécurité » de l'équipe, « Afficher le QR code » ne faisait rien quand le champ du mot de passe était vide.
On pouvait croire qu'un mot de passe devait arriver par e-mail. Maintenant :

```
[ Mot de passe : (vide) ]   Celui de votre compte Kemdia, choisi à l'inscription : aucun mot de passe n'est envoyé par e-mail.
[ Afficher le QR code ] →   « Saisissez le mot de passe de votre compte Kemdia (celui choisi à l'inscription). »
```

## 2. Fonctionnalités livrées

| Élément | Ce qui change                                                                                | Où                                       |
| ------- | -------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Message | Champ vide : message sous le champ, champ signalé invalide et sélectionné, rien n'est envoyé | `components/staff/SecondFactorSetup.tsx` |
| Aide    | Rappel permanent : c'est le mot de passe du compte, aucun n'est envoyé par e-mail            | idem                                     |
| Tests   | 2 tests : champ vide (message, focus, rien envoyé) ; mot de passe envoyé puis effacé         | `SecondFactorSetup.test.tsx`             |

Aucun changement de l'API, de la base ni du contrat.

## 3. Décisions techniques

Choix du 2026-10-28 : option recommandée retenue sans t'être reposée : un **message sous le champ** plutôt qu'un
bouton désactivé (un bouton gris n'explique pas quoi faire). Libellé « Mot de passe » inchangé (parcours de bout en
bout).

Décision complète : [ADR-0065](../architecture/adr/0065-2fa-mot-de-passe-explique.md).

## 4. Sécurité

### Relecture indépendante (agent séparé, avant la PR) : 0 critique, 0 haute, 1 moyenne, 1 basse, 1 info

| Problème relevé                                                                         | Correction                                                      |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Moyenne : le message n'était pas annoncé par les lecteurs d'écran (ni focus, ni alerte) | Focus remis sur le champ, qui est décrit par le message (testé) |
| Basse : le test ne vérifiait pas que le mot de passe est effacé après l'envoi           | Vérification ajoutée                                            |
| Info : messages fixes, échappés par React, rien sur le compte                           | Rien à faire                                                    |

## 5. Qualité

- Format et lint sur tout le dépôt, typecheck et build : ✓.
- Tests unitaires : API **670** ✓, site **503** ✓ (+2), contrat **34** ✓.
- Intégration sur une base PostgreSQL neuve : **262** ✓.
- `pnpm audit --audit-level high --prod` sans faille ; Gitleaks v8.30.1 ✓ ; bout en bout, Semgrep, CodeQL et ZAP : par
  la CI.

## 6. Captures d'écran

Visible sur la démo après le déploiement : page « Équipe → Sécurité », cliquer sur « Afficher le QR code » sans rien
saisir.

## 7. Limites connues / dette technique

- Aucune.

## 8. Prochaines étapes

- Aucune migration. Après la fusion, attendre « Déploiement DÉMO (Render) ».
- Suite du S9 : décisions du client (hébergement, nom de domaine, informations légales).
