# Rapport — Correctif : commandes serveur `admin:grant` et `mfa:reset` muettes

|                                                 |                                                            |
| ----------------------------------------------- | ---------------------------------------------------------- |
| **Date**                                        | 2026-10-16                                                 |
| **Sprint / tâches**                             | S6 — correctif (hors planning), signalé en testant la démo |
| **Version**                                     | v0.5.0 ; contrat de l'API 1.17.0 (inchangé)                |
| **Sections du cahier d'architecture modifiées** | aucune (guide `docs/guides/demo-gratuite.md`, étape 8)     |

## 1. Résumé

Sur la démo, `pnpm --filter @kemdia/api admin:grant <e-mail>` s'arrêtait en erreur **sans aucun message**, même avec la bonne
adresse de base. Impossible donc de créer le premier administrateur, et d'ouvrir `/equipe`. La commande de secours `mfa:reset`
(double authentification perdue) avait exactement le même défaut.

## 2. Cause

Depuis le S4-T07, le garde de session du module identité dépend du stockage des limites de débit (`ThrottlerModule`). L'API le
charge, mais le petit module Nest des deux commandes ne le chargeait pas : Nest refusait de démarrer. Avec les journaux coupés
(`logger: false`) et l'arrêt automatique de Nest (`abortOnError`, vrai par défaut), le processus s'arrêtait avec le code 1, sans
rien écrire. Les tests unitaires des commandes remplaçaient ce module par un faux : ils ne pouvaient pas le voir.

## 3. Correction

| Élément                         | Changement                                                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/cli/cli-context.ts`        | Nouveau contexte commun : `ThrottlerModule` chargé, `abortOnError: false` (l'erreur remonte)                                           |
| `admin-role.ts`, `mfa-reset.ts` | Utilisent ce contexte ; un échec au démarrage affiche « Échec au démarrage : <type>… », jamais l'adresse de la base                    |
| Tests unitaires                 | +2 : un démarrage qui échoue donne un message clair et le code 1                                                                       |
| Test d'intégration              | **Nouveau** `test/cli.int.test.ts` : démarre le VRAI contexte des deux commandes sur PostgreSQL (il échoue sur l'ancien code, vérifié) |
| Guide de la démo (étape 8)      | Adresse Neon complète, commande PowerShell, reconnexion, `/equipe` et double authentification, messages possibles                      |

## 4. Sécurité

**Relecture de sécurité indépendante** (agent séparé) : aucun problème bloquant. Corrigé : le guide faisait taper l'adresse
Neon (mot de passe compris) dans la commande, donc dans l'historique du terminal → elle est maintenant **collée à la demande**
(`Read-Host`, `read -rs`) ; le message d'échec montre le début de l'erreur, adresses masquées (un module manquant ne passe plus
pour une panne de base) ; un test d'intégration est renommé pour décrire le chemin réellement testé. Gardé : après un échec
tardif au démarrage, le processus peut attendre jusqu'à 30 s qu'une connexion inutilisée se ferme.

Aucune règle ne change : la commande exige toujours l'accès à la base, un compte inscrit et vérifié, et écrit au journal
d'audit. Les messages ne montrent jamais l'adresse de la base (testé).

## 5. Qualité

| Vérification                        | Résultat                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------- |
| Format, lint, types                 | ✅                                                                                     |
| Tests unitaires de l'API            | ✅ 543 (541 avant)                                                                     |
| Tests d'intégration (`kemdia_test`) | ✅ 181 (178 avant)                                                                     |
| Commandes réelles (base locale)     | ✅ accordé, déjà administrateur, retiré, compte inconnu, `mfa:reset`, base injoignable |
| Commande compilée (comme l'image)   | ✅ `node dist/cli/admin-role.js grant …` répond                                        |

## 6. Prochaine étape

Après la fusion : relancer `admin:grant` sur la démo (il n'y a rien à redéployer : la commande tourne sur ton poste).
