# Politique de sécurité — Kemdia

## Signaler une vulnérabilité

Merci de **ne pas** ouvrir d'issue publique. Utilisez l'onglet _Security → Report a vulnerability_
du dépôt GitHub (signalement privé), ou écrivez à security@kemdia.ga.
Nous accusons réception sous 72 h.

## Règles appliquées dans ce dépôt

- Aucun secret dans Git : variables d'environnement uniquement (`.env` ignoré, `.env.example` sans valeurs réelles).
  Détection automatique par Gitleaks en CI.
- Aucune donnée réelle (dump de base, sauvegarde, export clients) dans le dépôt.
- Toute PR passe : lint, types, tests, build, audit des dépendances, CodeQL.
- Les dépendances sont mises à jour chaque semaine par Dependabot.
- Les montants (prix, remises, frais de livraison) sont **toujours** recalculés côté serveur.
