# ADR-0039 — Vérification des vendeurs, KYC (BR-024)

- **Statut** : Accepté
- **Date** : 2026-10-17
- **Tâche** : S6-T08
- **Complète** : [ADR-0032](0032-boutiques-vendeurs.md) (boutiques), [ADR-0034](0034-double-authentification-equipe.md)
  (chiffrement AES-GCM des secrets TOTP), [ADR-0035](0035-photos-produits-vendeurs.md) (réencodage des photos),
  [ADR-0038](0038-commandes-vendeurs.md) (commandes des vendeurs)

## Contexte

La règle BR-024 interdit tout versement à un vendeur dont l'identité et le compte de versement ne sont pas vérifiés.
Ce dossier contient des **données très sensibles** : photo et numéro d'une pièce d'identité, extrait RCCM, compte
Mobile Money ou bancaire. Leur fuite exposerait les vendeurs à l'usurpation d'identité ; leur conservation doit être
limitée (APDPVP).

Choix du propriétaire (2026-10-17) :

| Question              | Choix                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------- |
| Stockage des photos   | **PostgreSQL, chiffrées** (AES-256-GCM), clé `KYC_ENCRYPTION_KEY` ajoutée par le propriétaire |
| Conservation          | Photos effacées **30 jours après la décision** (à confirmer avec le client, question n° 9)    |
| Effet d'un KYC absent | **Seulement les versements** (BR-024 telle quelle) : le vendeur vend normalement              |
| Mises à jour du site  | Menu du compte (liens des espaces), tableau de bord vendeur, pied de page                     |

## Décision

| Sujet         | Choix                                                                                                                                                                                                                                                     | Raison                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Dossier       | Un par boutique (`vendors.kyc_files`) : personne seule ou entreprise (RCCM obligatoire), nom sur la pièce, type (CNI, passeport, carte de séjour), numéro, compte de versement (Airtel 07…, Moov 06…, banque RIB/IBAN), titulaire                         | Ce qu'il faut pour payer la bonne personne                                          |
| Photos        | Recto toujours, verso sauf passeport, extrait RCCM pour une entreprise (`vendors.kyc_documents`, une par sorte)                                                                                                                                           | Le minimum pour vérifier                                                            |
| Chiffrement   | AES-256-GCM, nonce aléatoire, données associées « boutique:champ » (une boîte recopiée ailleurs ne s'ouvre pas). Numéro de pièce, compte et photos chiffrés ; seuls les **4 derniers caractères** restent en clair                                        | La base (sauvegardes comprises) ne contient jamais ces données en clair             |
| Clé           | `KYC_ENCRYPTION_KEY`, **différente** de la clé TOTP (refus au démarrage sinon). Clé de développement publique : **poste local seulement**, jamais en démo (de vraies pièces peuvent y être envoyées). Sans clé : `KYC_INDISPONIBLE` (503)                 | Une fuite ne livre pas les deux ; aucune vraie pièce chiffrée avec une clé publique |
| Photos reçues | Même méthode que les photos de produits : format lu dans les octets ET par le décodeur, 40 Mpx au plus, 300 px au moins, WebP 1 600 px **sans métadonnées** (ni EXIF ni GPS), 2 à la fois (8 en attente au plus), 15 s au plus                            | Pas de bombe de décompression ; rien de caché dans le fichier                       |
| Vendeur       | Rôle vendeur et boutique active. Remplit, envoie les photos (réduites dans son navigateur), soumet. Ne revoit **jamais** ses numéros complets ni ses photos. Modifiable en préparation ou après un refus ; figé une fois envoyé ou validé                 | Un compte volé ne permet pas de lire la pièce du vendeur                            |
| Équipe        | **Administrateurs** seulement (pas les modérateurs), double authentification confirmée. Seuls les dossiers **envoyés** sont visibles. Ouvrir un dossier et regarder une photo sont **inscrits au journal d'audit**. Personne n'examine sa propre boutique | Moins de personnes voient les pièces ; chaque regard laisse une trace               |
| Décision      | Valider, ou refuser avec un motif montré au vendeur (5 à 300 caractères). Journal : `kyc.approved`, `kyc.rejected`                                                                                                                                        | Le vendeur sait quoi corriger                                                       |
| Conservation  | Tâche planifiée (chaque heure) : photos des dossiers décidés depuis 30 jours effacées (dossiers verrouillés, ceux en cours de correction attendent). Le dossier et la décision restent                                                                    | Minimisation (APDPVP) ; preuve de la vérification gardée                            |
| Site          | Vendeur : `/vendeur/verification` (formulaire HTML simple, photos par le relais commun `lib/vendor/upload-relay.ts`). Équipe : `/equipe/verifications` et sa fiche ; photos relayées sans cache                                                           | Même modèle que les autres espaces                                                  |
| En-tête       | Le menu du compte montre « Espace vendeur », « Commandes à traiter » et « Espace de l'équipe » selon les rôles : le navigateur reçoit deux oui/non, jamais la liste des rôles                                                                             | Les vendeurs trouvent leurs commandes sans passer par « Mon compte »                |

Contrat de l'API : **1.19.0** (routes `vendors/kyc` et `admin/kyc`, schémas `KycRequest`, `VendorKyc`, `AdminKyc…`, codes
`KYC_*` et `DOCUMENT_INTROUVABLE`).

## Conséquences

- Les versements (avec les commissions, BR-020) devront vérifier `status = approved` avant tout paiement.
- **Changer ou perdre la clé** rend les dossiers existants illisibles (pas d'identifiant de clé dans la boîte) : il
  faudrait les redemander. Une rotation de clé sera une tâche à part si elle devient nécessaire.
- Les photos d'un dossier **jamais envoyé** ou **jamais décidé** ne sont pas effacées automatiquement (risque accepté
  au MVP, relecture de sécurité) ; une durée maximale pourra être ajoutée.
- Une boutique qui a un dossier ne peut plus être supprimée physiquement (`ON DELETE RESTRICT`) : le futur parcours
  de suppression de compte devra effacer le dossier et ses photos explicitement.
- Un changement de compte de versement après validation passe par le service client (pas d'écran au MVP).

## Alternatives écartées

- **Stockage objet (S3, R2)** : service payant, à discuter avec le client ; le port `KycRepository` permet de changer.
- **Aucune photo, vérification en personne** : pas de trace de ce qui a été vérifié.
- **Chiffrement par la base (pgcrypto)** : la clé passerait dans les requêtes SQL et les journaux de la base.
