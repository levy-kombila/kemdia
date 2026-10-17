import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "../../../http/business-exception.js";
import { OrdersError, withOrdersErrors } from "../../orders/index.js";
import { ShippingError, type ShippingErrorCode } from "../domain/shipping-error.js";

/** Statut HTTP de chaque erreur métier du module shipping. */
const STATUS: Record<ShippingErrorCode, number> = {
  EXPEDITION_INTROUVABLE: HttpStatus.NOT_FOUND,
  EXPEDITION_IMPOSSIBLE: HttpStatus.CONFLICT,
  STATUT_EXPEDITION_INCOMPATIBLE: HttpStatus.CONFLICT,
  EXPEDITION_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  TARIFS_INVALIDES: HttpStatus.UNPROCESSABLE_ENTITY,
};

const capitalize = (message: string) => message.charAt(0).toUpperCase() + message.slice(1);

/**
 * Exécute un cas d'utilisation ; une erreur métier devient une réponse HTTP avec son code. Les refus du module orders
 * (commande pas prête, déjà encaissée…) deviennent `EXPEDITION_IMPOSSIBLE` ; les autres (commande introuvable,
 * commande occupée) gardent leur code.
 */
export function withShippingErrors<T>(run: () => Promise<T>): Promise<T> {
  return withOrdersErrors(async () => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ShippingError) {
        throw new BusinessException(STATUS[error.code], capitalize(error.message), error.code);
      }
      if (error instanceof OrdersError && error.code === "ANNULATION_IMPOSSIBLE") {
        throw new BusinessException(
          STATUS.EXPEDITION_IMPOSSIBLE,
          capitalize(error.message),
          "EXPEDITION_IMPOSSIBLE",
        );
      }
      throw error;
    }
  });
}

export const SHIPPING_ERROR_STATUS = STATUS;
