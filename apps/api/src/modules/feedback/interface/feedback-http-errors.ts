import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "../../../http/business-exception.js";
import { FeedbackError, type FeedbackErrorCode } from "../domain/feedback-error.js";

/** Statut HTTP de chaque erreur métier des signalements. */
export const FEEDBACK_ERROR_STATUS: Record<FeedbackErrorCode, number> = {
  SIGNALEMENT_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  TROP_DE_SIGNALEMENTS: HttpStatus.TOO_MANY_REQUESTS,
  SIGNALEMENT_INTROUVABLE: HttpStatus.NOT_FOUND,
  SIGNALEMENT_MODIFIE: HttpStatus.CONFLICT,
};

const capitalize = (message: string) => message.charAt(0).toUpperCase() + message.slice(1);

/** Exécute un cas d'utilisation ; une erreur métier devient une réponse HTTP avec son code. */
export async function withFeedbackErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof FeedbackError) {
      throw new BusinessException(
        FEEDBACK_ERROR_STATUS[error.code],
        capitalize(error.message),
        error.code,
      );
    }
    throw error;
  }
}
