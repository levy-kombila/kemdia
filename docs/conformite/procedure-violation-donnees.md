# Procédure — violation de données personnelles

> Loi n°001/2011 modifiée, art. 79 : notifier l'APDPVP « sans délai excessif » et prévenir les personnes concernées
> quand la violation présente un risque pour elles. Amendes de 1 à 100 millions de FCFA. Créé au S7-T08 (ADR-0047).

## 1. Détecter

Signaux : alerte de surveillance (Healthchecks.io, UptimeRobot), alerte ZAP / CodeQL / Gitleaks, journal d'audit
inhabituel (`*.locked`, rôles accordés), signalement d'un client ou d'un chercheur, perte d'un poste ou d'une clé.

## 2. Contenir (dans l'heure)

1. Nommer un responsable de l'incident ; ouvrir un journal daté (qui, quoi, quand).
2. Couper l'accès : révoquer les sessions (`logout-all` du compte touché ou de toute l'équipe), changer les secrets
   exposés (`init-secrets.sh` sur le serveur — avec l'accord du propriétaire), bloquer l'adresse IP en cause.
3. Garder les preuves : journaux du serveur, journal d'audit, instantané de sauvegarde (`restore.sh`).

## 3. Évaluer (sous 24 h)

- Quelles données (identité, commandes, numéros Mobile Money, pièces d'identité KYC…) ?
- Combien de personnes ? Données chiffrées ou non (pièces KYC et sauvegardes le sont) ?
- Risque pour les personnes : faible / élevé (usurpation, fraude Mobile Money, hameçonnage ciblé).

## 4. Notifier

| Qui             | Quand                                                         | Contenu                                                                                                                          |
| --------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| APDPVP          | **Sans délai excessif** (objectif : 72 h après la découverte) | Nature, données et personnes touchées, conséquences, mesures prises, contact                                                     |
| Personnes       | Si risque élevé, en même temps                                | En mots simples : ce qui s'est passé, ce qu'on a fait, ce qu'elles doivent faire (changer de mot de passe, se méfier des appels) |
| Client (Kemdia) | Immédiatement                                                 | Point de situation                                                                                                               |

Contact APDPVP et formulaire : **à compléter** (question ouverte n°10).

## 5. Corriger et apprendre

Corriger la cause (PR avec revue de sécurité), rejouer les contrôles (ZAP, ASVS), écrire un rapport d'incident sans
recherche de coupable dans `docs/rapports/`, et garder le registre des violations (date, nature, personnes, décision
de notifier ou non et pourquoi) — même quand on ne notifie pas.
