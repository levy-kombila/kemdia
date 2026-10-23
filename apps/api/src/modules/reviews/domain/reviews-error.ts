/** Codes d'erreur métier des avis (S8-T01), stables : renvoyés par l'API. */
export type ReviewsErrorCode =
  /** Note, commentaire ou motif mal remplis (détail dans le message). */
  | "AVIS_INVALIDE"
  /** Seul un client dont une commande contenant ce produit est livrée peut donner son avis. */
  | "ACHAT_REQUIS"
  /** Fiche inconnue ou pas en ligne. */
  | "PRODUIT_INTROUVABLE"
  /** Pas (ou plus) d'avis à cet endroit. */
  | "AVIS_INTROUVABLE"
  /** Décision impossible : l'avis n'attend plus l'équipe. */
  | "AVIS_DEJA_TRAITE";

export class ReviewsError extends Error {
  constructor(
    readonly code: ReviewsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ReviewsError";
  }
}
