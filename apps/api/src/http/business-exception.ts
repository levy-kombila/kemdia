import { HttpException } from "@nestjs/common";

/**
 * Erreur métier prévue : statut HTTP, message en français, code stable (champ `code` des Problem Details)
 * et, si besoin, délai avant de réessayer (en-tête `Retry-After`).
 * Les modules convertissent leurs erreurs de domaine en `BusinessException` dans leur couche interface.
 */
export class BusinessException extends HttpException {
  constructor(
    status: number,
    message: string,
    readonly code: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message, status);
    this.name = "BusinessException";
  }
}
