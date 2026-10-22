import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "../../../http/business-exception.js";
import { withOrdersErrors } from "../../orders/index.js";
import { PaymentsError, type PaymentsErrorCode } from "../domain/payments-error.js";

/** Statut HTTP de chaque erreur métier du module payments. */
const STATUS: Record<PaymentsErrorCode, number> = {
  PAIEMENT_IMPOSSIBLE: HttpStatus.CONFLICT,
  PAIEMENT_EN_COURS: HttpStatus.CONFLICT,
  TROP_D_ESSAIS_PAIEMENT: HttpStatus.CONFLICT,
  PAIEMENT_INDISPONIBLE: HttpStatus.SERVICE_UNAVAILABLE,
  PAIEMENT_INTROUVABLE: HttpStatus.NOT_FOUND,
  REMBOURSEMENT_INTROUVABLE: HttpStatus.NOT_FOUND,
  REMBOURSEMENT_DEJA_FAIT: HttpStatus.CONFLICT,
  ENCAISSEMENT_IMPOSSIBLE: HttpStatus.CONFLICT,
  SIGNATURE_INVALIDE: HttpStatus.UNAUTHORIZED,
  NOTIFICATION_EXPIREE: HttpStatus.UNAUTHORIZED,
  DEMANDE_INTROUVABLE: HttpStatus.NOT_FOUND,
  CODE_PIN_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  FACTURE_INTROUVABLE: HttpStatus.NOT_FOUND,
  ENVOI_IMPOSSIBLE: HttpStatus.CONFLICT,
};

/**
 * Exécute un cas d'utilisation ; une erreur métier (paiement, ou commande : introuvable, annulation impossible,
 * commande occupée) devient une réponse HTTP avec son code.
 */
export async function withPaymentsErrors<T>(run: () => Promise<T>): Promise<T> {
  return withOrdersErrors(async () => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof PaymentsError) {
        const message = error.message.charAt(0).toUpperCase() + error.message.slice(1);
        throw new BusinessException(STATUS[error.code], message, error.code);
      }
      throw error;
    }
  });
}

export const PAYMENTS_ERROR_STATUS = STATUS;
