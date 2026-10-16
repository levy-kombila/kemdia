# ADR-0036 — Écrans de l'équipe sur le site (`/equipe`)

- **Statut** : Accepté
- **Date** : 2026-10-16
- **Tâche** : S6-T05
- **Complète** : [ADR-0032](0032-boutiques-vendeurs.md) (boutiques), [ADR-0033](0033-produits-vendeurs-moderation.md)
  (modération), [ADR-0034](0034-double-authentification-equipe.md) (double authentification),
  [ADR-0035](0035-photos-produits-vendeurs.md) (photos)

## Contexte

Les tâches S6-T01 à S6-T04 ont été faites en « API seule » : boutiques, modération, double authentification et photos
fonctionnent, mais seulement en appelant l'API à la main. Rien n'était visible ni testable par le client, et aucun écran ne
vérifiait que l'API suffit à un vrai travail de modération. Il faut un premier espace d'équipe sur le site, sans affaiblir la
protection de l'API (rôle + double authentification confirmée depuis moins de 15 minutes, ADR-0034).

Choix du propriétaire (2026-10-16) :

| Question         | Choix                                                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| Ordre des écrans | **Équipe d'abord** (S6-T05), espace vendeur ensuite (S6-T06) : sans l'administration, aucun vendeur validé |
| Périmètre        | **Double authentification + boutiques + modération** ; rôles, journal, coupons, réglages : plus tard       |
| Adresse          | **`/equipe`** (en français comme `/compte` ; moins visée que `/admin`), jamais indexée                     |
| QR code          | **Dessiné côté serveur**, zéro JavaScript en plus dans le navigateur                                       |
| Écrans           | **Téléphone et ordinateur**                                                                                |

## Décision

| Sujet                       | Choix                                                                                                                                                                                                                                                                  | Raison                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Pages                       | `/equipe` (tableau de bord : produits à modérer, boutiques à examiner), `/equipe/securite`, `/equipe/confirmer`, `/equipe/boutiques[/id]` (administrateurs), `/equipe/moderation[/id]` (modérateurs et administrateurs)                                                | Le parcours vendeur → validation → mise en ligne se fait entièrement à l'écran                   |
| Garde côté site             | `lib/staff/staff.ts` : pas connecté → connexion puis retour ; ni modérateur ni administrateur → **404** ; 2FA pas activée → « Sécurité » ; pas confirmée → saisie du code puis retour. **L'API reste juge** de chaque lecture et décision                              | Le site évite une page vide ; la sécurité ne dépend pas de lui                                   |
| Adresse de retour           | `staffPath` : seulement `/equipe/…`, segments `[a-z0-9-]`, requête à caractères simples, découpée sans expression régulière imbriquée ; jamais `/equipe/confirmer` ni `/equipe/securite`                                                                               | Pas de redirection ouverte, pas de boucle, pas de ReDoS                                          |
| Adaptateur                  | `lib/staff/api-staff.ts` (`server-only`) : clé interne + jeton du cookie `HttpOnly` + adresse du visiteur ; réponses vérifiées par les schémas du contrat ; identifiants vérifiés (UUID) avant tout appel ; journaux sans identifiant ni secret                        | Même principe que les adaptateurs du S4 et du S5                                                 |
| Double auth.                | Mot de passe → secret et QR code → premier code → 10 codes de secours **montrés une fois** (fichier `.txt` fabriqué dans le navigateur, case « j'ai rangé mes codes ») ; saisie d'un code ou d'un code de secours ; nouveaux codes contre un code frais                | Secret et codes seulement dans la réponse d'une action POST : ni adresse, ni cookie, ni cache    |
| QR code                     | Bibliothèque **`uqr` 0.1.3** (MIT, aucune dépendance), appelée **sur le serveur** ; le navigateur reçoit un tracé fait seulement de chiffres et de `M h v z`, rendu par React dans l'attribut `d` d'un `<path>` (pas de `dangerouslySetInnerHTML`) ; lien `otpauth://` | Aucun code de QR ni secret dans le JavaScript du site ; `qrcode` aurait ajouté `yargs` et autres |
| Décisions                   | Simples formulaires HTML vers des actions serveur (marchent sans JavaScript) ; refus et suspension repliés, motif obligatoire ; la version lue (`submittedAt`) part avec chaque décision de modération ; résultat dans l'adresse par une **liste fermée** de codes     | Aucun texte libre de l'adresse affiché ; pas de clic distrait                                    |
| Erreurs                     | 2FA à confirmer → code puis retour ; session refusée → **oubliée de la mémoire de 10 s** puis connexion ; rôle retiré → 404 ; 3 codes faux → l'API ferme la session, le site efface le cookie                                                                          | Pas de boucle de redirections (relecture de sécurité)                                            |
| Photos à modérer            | Relais `/equipe/moderation/{produit}/photos/{photo}` : jeton présenté à l'API à chaque photo, WebP vérifié (type, en-tête, 2 Mo), `private, no-store`, `nosniff`, `same-origin`, `no-referrer` ; refus ou absence de session → **404** comme une photo inconnue        | Les photos non validées ne sont jamais publiques ni en cache ; l'espace ne se signale pas        |
| Accès depuis « Mon compte » | Un modérateur ou un administrateur voit « Ouvrir l'espace de l'équipe » ; personne d'autre                                                                                                                                                                             | Pas de lien vers un espace inaccessible                                                          |
| Indexation                  | `robots: noindex, nofollow` ; `/equipe` **pas** listé dans `robots.txt` (ce serait l'annoncer)                                                                                                                                                                         |                                                                                                  |
| Données de test             | `e2e/fixtures/equipe-e2e.sql` crée un administrateur de test : il **refuse de s'exécuter** sans le réglage de session `kemdia.e2e = on`, que seule la CI passe                                                                                                         | Lancé par erreur sur la démo, il ne crée jamais d'administrateur au mot de passe public          |

Le contrat de l'API ne change pas (1.17.0) : tout ce dont l'écran a besoin existait.

## Options écartées

- **QR code dessiné dans le navigateur** : une bibliothèque de plus à charger, et le secret dans du code client.
- **Clé à taper seulement** : 32 caractères à recopier sur un téléphone, source d'erreurs.
- **`/admin`** : première adresse essayée par les robots d'attaque.
- **Formulaires de décision en composants client** : JavaScript en plus pour rien ; un formulaire HTML suffit et marche sans JS.
- **Tout l'administration existante dans la même tâche** (rôles, journal, coupons, réglages) : PR trop grosse à relire.

## Conséquences

- ➕ Le client voit enfin le travail du S6 ; le parcours vendeur → validation → mise en ligne est testé de bout en bout (Playwright).
- ➕ Aucun JavaScript en plus sur les pages publiques (169 à 172 Ko, comme avant) ; l'espace de l'équipe pèse comme une fiche produit.
- ➖ Un motif de refus déjà saisi est perdu si l'API refuse la décision (page rechargée avec le message) : rare, accepté.
- ➖ Les compteurs du tableau de bord s'arrêtent à « 100+ » (une page de la file).
- ➖ Un membre de l'équipe dont la session n'est pas confirmée voit la page « confirmer » : il faut son téléphone à chaque nouvelle session (voulu, ADR-0034).
- 🔜 S6-T06 : espace vendeur (boutique, produits, envoi des photos). Plus tard : rôles, journal d'audit, coupons et réglages à l'écran.
