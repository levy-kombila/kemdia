# ADR-0060 — Accueil : encart du compte selon la connexion et le rôle vendeur

- **Statut** : Accepté
- **Date** : 2026-10-24
- **Tâche** : S8-T08 (retour du propriétaire sur la page d'accueil)
- **Complète** : [ADR-0059](0059-accueil-300ms-etalonnage.md) (accueil allégé)

## Contexte

À droite de la bannière de l'accueil (grand écran), l'encart montrait toujours « Se connecter » et « Créer un compte »,
et l'encart vert « Devenir vendeur », même pour un client connecté ou un vendeur qui a déjà sa boutique.

## Décision

1. La page d'accueil lit le compte connecté avec `getCurrentAccount()`, **la même lecture que l'en-tête** (une fois
   par requête grâce au `cache` de React ; aucun appel à l'API sans cookie de session). Seuls le **prénom** et un
   **oui/non vendeur** (rôle `vendor`, comme le lien « Espace vendeur » de l'en-tête) vont à l'encart.
2. Encart du compte : visiteur → « Se connecter », « Créer un compte » ; connecté → « Bonjour, {prénom} »,
   « Mes commandes » (`/compte/commandes`) et « Mon compte » (`/compte`).
3. Encart vendeur : vendeur → « Votre boutique Kemdia », lien **« Accéder à votre boutique »** vers `/vendeur` ;
   sinon « Devenir vendeur » vers `/vendre`, comme avant.
4. Session expirée (cookie refusé par l'API) : traitée comme un visiteur ; l'en-tête efface déjà le cookie.

Choix du 2026-10-24 : options recommandées retenues sans être reposées (ta demande du 2026-10-23).

## Conséquences

- Un client voit des raccourcis utiles au lieu d'invitations à se connecter ; un vendeur va à sa boutique en un clic.
- Aucun appel de plus à l'API : la lecture du compte est partagée avec l'en-tête ; aucun composant à hydrater de
  plus (l'encart reste rendu par le serveur), donc aucun effet sur le budget de l'accueil.
- La page d'accueil reste rendue à la demande pour chaque visiteur (elle l'était déjà : `force-dynamic`).

### Risques acceptés

- Comme l'en-tête, l'encart reflète la session lue au plus 10 s plus tôt (cache de session du site) : après une
  connexion ou une déconnexion, `refreshSessionAction` vide ce cache, donc l'écart ne se voit pas en pratique.
- L'encart, masqué sur téléphone, est quand même envoyé avec le prénom (relecture de sécurité, info) : l'en-tête
  envoie déjà ce prénom dans la même réponse, privée et jamais mise en cache.
- Le test de bout en bout contient le mot de passe des comptes de test (relecture, info) : comptes de la base
  éphémère de la CI seulement, comme pour `vendeur.spec.ts`.

## Alternatives écartées

- **Encart rendu dans le navigateur** (composant client lisant la session) : un composant de plus à hydrater et un
  affichage « Se connecter » le temps de la lecture.
- **Masquer l'encart pour un compte connecté** : on perdrait des raccourcis utiles et la mise en page à trois colonnes.
