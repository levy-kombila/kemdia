import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "../../../http/business-exception.js";
import { ReviewsError, type ReviewsErrorCode } from "../domain/reviews-error.js";

/** Statut HTTP de chaque erreur métier des avis. */
export const REVIEWS_ERROR_STATUS: Record<ReviewsErrorCode, number> = {
  AVIS_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  ACHAT_REQUIS: HttpStatus.FORBIDDEN,
  PRODUIT_INTROUVABLE: HttpStatus.NOT_FOUND,
  AVIS_INTROUVABLE: HttpStatus.NOT_FOUND,
  AVIS_DEJA_TRAITE: HttpStatus.CONFLICT,
  AVIS_MODIFIE: HttpStatus.CONFLICT,
};

const capitalize = (message: string) => message.charAt(0).toUpperCase() + message.slice(1);

/** Exécute un cas d'utilisation ; une erreur métier devient une réponse HTTP avec son code. */
export async function withReviewsErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof ReviewsError) {
      throw new BusinessException(
        REVIEWS_ERROR_STATUS[error.code],
        capitalize(error.message),
        error.code,
      );
    }
    throw error;
  }
}
