# Procédure — demandes d'exercice des droits

> Loi n°001/2011 modifiée : accès (art. 43–44), rectification et effacement (art. 50–53, « dans les meilleurs
> délais »), portabilité (art. 58–59), opposition (art. 60–65). Créé au S7-T08 (ADR-0047).

## 1. En libre-service (le plus simple)

| Droit         | Où                                                                               | Effet                                                                   |
| ------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Accès         | Mon compte → Mes données → Télécharger                                           | Fichier JSON de toutes les données du compte (journal d'audit)          |
| Portabilité   | Même fichier (format ouvert, lisible)                                            | —                                                                       |
| Effacement    | Mon compte → Mes données → Supprimer                                             | Immédiat, mot de passe exigé ; refusé tant qu'une commande est en cours |
| Rectification | Prénom / nom : par le service client (écran à venir) ; mot de passe : Mon compte | —                                                                       |

## 2. Demande écrite (e-mail ou courrier)

1. **Enregistrer** la demande (date de réception, canal, droit demandé) dans le suivi du service client.
2. **Vérifier l'identité** : la demande doit venir de l'adresse e-mail ou du mobile du compte. Sinon, demander une
   preuve (jamais de copie de pièce d'identité conservée au-delà de la vérification).
3. **Répondre sous 30 jours au plus** (objectif : 7 jours). Gratuit.
4. Selon le droit :
   - **accès / portabilité** : se connecter n'est pas possible pour la personne ? Un administrateur produit la copie
     (même contenu que `GET /api/v1/account/data`) et l'envoie à l'adresse du compte uniquement ;
   - **effacement** : expliquer le libre-service ; si la personne ne peut pas se connecter, l'équipe déclenche
     l'effacement après vérification (outil d'administration à prévoir au S7-T09 ou au S7.5) ;
   - **opposition** : Kemdia n'envoie pas de prospection ; si une lettre d'information est ajoutée, elle sera à
     consentement explicite avec désinscription en un clic.
5. **Refus** (rare : demande abusive, obligation de conservation) : le motiver par écrit et rappeler le droit de
   saisir l'APDPVP.
6. **Archiver** la réponse (date, décision) 3 ans.

## 3. Ce qui est gardé après un effacement

Factures (10 ans, OHADA) telles qu'émises, avec le nom, le téléphone et l'adresse de l'acheteur ; montants et statuts
des commandes (anonymisées) ; lignes du journal d'audit (365
jours, sans nom ni e-mail) ; sauvegardes chiffrées jusqu'à leur rotation (6 mois au plus).
