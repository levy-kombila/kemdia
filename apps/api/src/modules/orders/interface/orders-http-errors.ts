import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "../../../http/business-exception.js";
import { OrdersError, type OrdersErrorCode } from "../domain/orders-error.js";

/** Statut HTTP de chaque erreur métier du module orders. */
const STATUS: Record<OrdersErrorCode, number> = {
  PANIER_PLEIN: HttpStatus.CONFLICT,
  PRODUIT_INDISPONIBLE: HttpStatus.CONFLICT,
  VARIANTE_INCONNUE: HttpStatus.NOT_FOUND,
  PANIER_OCCUPE: HttpStatus.CONFLICT,
};

/** Exécute un cas d'utilisation ; une erreur métier devient une réponse HTTP avec son code. */
export async function withOrdersErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof OrdersError) {
      const message = error.message.charAt(0).toUpperCase() + error.message.slice(1);
      throw new BusinessException(STATUS[error.code], message, error.code, error.retryAfterSeconds);
    }
    throw error;
  }
}

export const ORDERS_ERROR_STATUS = STATUS;
