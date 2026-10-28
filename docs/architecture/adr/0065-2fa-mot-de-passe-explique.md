# ADR-0065 — Double authentification : étape du mot de passe expliquée

- **Statut** : Accepté
- **Date** : 2026-10-28
- **Tâche** : S9-T01 (retour du propriétaire)
- **Complète** : [ADR-0036](0036-ecrans-equipe.md) (écrans de l'équipe)

## Contexte

Sur la page « Sécurité » de l'équipe, cliquer sur « Afficher le QR code » avec le champ vide ne faisait **rien** (le
formulaire s'arrêtait sans message). Le propriétaire a cru qu'un mot de passe devait lui être envoyé, alors qu'il
s'agit de celui de son propre compte.

## Décision

1. Champ vide : message sous le champ, « Saisissez le mot de passe de votre compte Kemdia (celui choisi à
   l'inscription). », champ signalé invalide aux lecteurs d'écran ; aucune demande n'est envoyée.
2. Aide permanente sous le champ : « Celui de votre compte Kemdia, choisi à l'inscription : aucun mot de passe n'est
   envoyé par e-mail. »
3. Le libellé du champ (« Mot de passe ») et le reste du parcours ne changent pas.

Choix du 2026-10-28 : option recommandée retenue sans être reposée (ta demande du 2026-10-23).

## Conséquences

- Plus de clic sans réponse ; l'étape s'explique d'elle-même. Aucun changement de l'API ni de la base.

### Risques acceptés

- Aucun : le message ne dit rien du compte (ni s'il existe, ni son mot de passe).

## Alternatives écartées

- **Bouton désactivé tant que le champ est vide** : un bouton gris n'explique pas quoi faire.
