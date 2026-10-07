import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "../../../http/business-exception.js";
import { IdentityError, type IdentityErrorCode } from "../domain/identity-error.js";

/** Statut HTTP de chaque erreur métier de l'identité. */
const STATUS: Record<IdentityErrorCode, number> = {
  IDENTIFIANT_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  NOM_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  MOT_DE_PASSE_FAIBLE: HttpStatus.UNPROCESSABLE_ENTITY,
  CANAL_INDISPONIBLE: HttpStatus.UNPROCESSABLE_ENTITY,
  CODE_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  CODE_EXPIRE: HttpStatus.GONE,
  ENVOI_TROP_RAPPROCHE: HttpStatus.TOO_MANY_REQUESTS,
  TROP_D_ENVOIS: HttpStatus.TOO_MANY_REQUESTS,
  TROP_D_ESSAIS: HttpStatus.TOO_MANY_REQUESTS,
  COMPTE_BLOQUE: HttpStatus.LOCKED,
};

/** Exécute un cas d'utilisation ; une erreur métier devient une réponse HTTP avec son code. */
export async function withIdentityErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof IdentityError) {
      // Première lettre en majuscule pour l'affichage (« Code incorrect »)
      const message = error.message.charAt(0).toUpperCase() + error.message.slice(1);
      throw new BusinessException(STATUS[error.code], message, error.code, error.retryAfterSeconds);
    }
    throw error;
  }
}

export const IDENTITY_ERROR_STATUS = STATUS;
