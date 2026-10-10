import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "../../../http/business-exception.js";
import { OrdersError, type OrdersErrorCode } from "../domain/orders-error.js";

/** Statut HTTP de chaque erreur métier du module orders (panier et commandes). */
const STATUS: Record<OrdersErrorCode, number> = {
  PANIER_PLEIN: HttpStatus.CONFLICT,
  PRODUIT_INDISPONIBLE: HttpStatus.CONFLICT,
  VARIANTE_INCONNUE: HttpStatus.NOT_FOUND,
  PANIER_OCCUPE: HttpStatus.CONFLICT,
  // Commandes (S5-T02)
  PANIER_VIDE: HttpStatus.CONFLICT,
  PANIER_A_VERIFIER: HttpStatus.CONFLICT,
  PRIX_MODIFIE: HttpStatus.CONFLICT,
  ADRESSE_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  NUMERO_PAIEMENT_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  PAIEMENT_A_LA_LIVRAISON_INDISPONIBLE: HttpStatus.UNPROCESSABLE_ENTITY,
  COMMANDE_INTROUVABLE: HttpStatus.NOT_FOUND,
  ANNULATION_IMPOSSIBLE: HttpStatus.CONFLICT,
  CLE_DEJA_UTILISEE: HttpStatus.CONFLICT,
  TROP_DE_COMMANDES_OUVERTES: HttpStatus.CONFLICT,
  // Coupons (S5-T03)
  COUPON_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  COUPON_EXPIRE: HttpStatus.UNPROCESSABLE_ENTITY,
  COUPON_EPUISE: HttpStatus.CONFLICT,
  COUPON_DEJA_UTILISE: HttpStatus.CONFLICT,
  COUPON_MINIMUM_NON_ATTEINT: HttpStatus.UNPROCESSABLE_ENTITY,
  COUPON_NON_APPLICABLE: HttpStatus.UNPROCESSABLE_ENTITY,
  COUPON_EXISTE: HttpStatus.CONFLICT,
  COUPON_INTROUVABLE: HttpStatus.NOT_FOUND,
  COUPON_TROP_D_ESSAIS: HttpStatus.TOO_MANY_REQUESTS,
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
