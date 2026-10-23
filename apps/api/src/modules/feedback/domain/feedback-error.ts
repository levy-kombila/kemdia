/** Codes d'erreur métier des signalements (S8-T02), stables : renvoyés par l'API. */
export type FeedbackErrorCode =
  /** Genre, description ou page mal remplis (détail dans le message). */
  | "SIGNALEMENT_INVALIDE"
  /** Trop de signalements pas encore résolus pour ce compte. */
  | "TROP_DE_SIGNALEMENTS"
  /** Signalement inconnu (ou effacé avec le compte de son auteur). */
  | "SIGNALEMENT_INTROUVABLE"
  /** Le signalement a changé depuis qu'il a été lu : relire avant de décider. */
  | "SIGNALEMENT_MODIFIE";

export class FeedbackError extends Error {
  constructor(
    readonly code: FeedbackErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "FeedbackError";
  }
}
