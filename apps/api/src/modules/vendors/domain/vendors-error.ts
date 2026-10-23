/** Codes d'erreur métier du module vendors (stables : renvoyés par l'API dans le champ `code`). */
export type VendorsErrorCode =
  /** Demande ou motif mal rempli (champ en cause dans le message). */
  | "BOUTIQUE_INVALIDE"
  /** Le compte a déjà une boutique (en attente, active ou suspendue). */
  | "BOUTIQUE_EXISTE"
  /** Une autre boutique porte déjà ce nom (ou un nom identique aux accents et à la ponctuation près). */
  | "NOM_BOUTIQUE_PRIS"
  | "BOUTIQUE_INTROUVABLE"
  /** La décision ne s'applique pas à une boutique dans cet état (ex. refuser une boutique déjà active). */
  | "STATUT_BOUTIQUE_INCOMPATIBLE"
  /** Un administrateur ne décide jamais pour sa propre boutique. */
  | "BOUTIQUE_SUR_SOI_INTERDITE"
  /** Le compte du vendeur est fermé ou n'existe plus : la boutique ne peut pas être validée. */
  | "PROPRIETAIRE_INACTIF"
  /** Une autre opération verrouille la boutique ou la demande : réessayer dans un instant. */
  | "BOUTIQUE_OCCUPEE"
  // Produits des vendeurs et modération (S6-T02)
  /** Le compte n'a pas de boutique active (en attente, refusée, suspendue ou aucune). */
  | "BOUTIQUE_INACTIVE"
  /** Import du catalogue (S8-T03) : le corps n'est pas un fichier CSV (en-tête Content-Type text/csv). */
  | "FICHIER_IMPORT_INVALIDE"
  /** Un autre import du catalogue est en cours (un seul à la fois pour toute l'API). */
  | "IMPORT_EN_COURS"
  /** L'écriture du fichier a dépassé 2 minutes : rien n'est importé, découper le fichier. */
  | "IMPORT_TROP_LONG"
  /** Un modérateur ne décide jamais pour un produit de sa propre boutique. */
  | "PRODUIT_SUR_SOI_INTERDIT"
  /** Dossier de vérification mal rempli (champ en cause dans le message) — S6-T08 */
  | "KYC_INVALIDE"
  /** Pas encore de dossier de vérification */
  | "KYC_INTROUVABLE"
  /** Photos manquantes : le dossier ne peut pas être envoyé */
  | "KYC_INCOMPLET"
  /** Le dossier ne permet pas cette action dans son état (envoyé, déjà décidé…) */
  | "STATUT_KYC_INCOMPATIBLE"
  /** Clé de chiffrement absente : vérification fermée */
  | "KYC_INDISPONIBLE"
  /** Photo du dossier absente (jamais envoyée, ou effacée après la décision) */
  | "DOCUMENT_INTROUVABLE"
  /** Photo du dossier refusée (S6-T08 ; mêmes codes que les photos de produits) */
  | "FORMAT_IMAGE_INVALIDE"
  | "IMAGE_TROP_GRANDE"
  | "IMAGE_TROP_PETITE";

/** Une règle des boutiques n'est pas respectée. Le message est lisible par un humain, en français. */
export class VendorsError extends Error {
  constructor(
    readonly code: VendorsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "VendorsError";
  }
}
