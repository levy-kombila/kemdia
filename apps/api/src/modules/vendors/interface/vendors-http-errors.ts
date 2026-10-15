import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "../../../http/business-exception.js";
import { IdentityError } from "../../identity/index.js";
import { VendorsError, type VendorsErrorCode } from "../domain/vendors-error.js";

/** Statut HTTP de chaque erreur métier du module vendors. */
const STATUS: Record<VendorsErrorCode, number> = {
  BOUTIQUE_INVALIDE: HttpStatus.UNPROCESSABLE_ENTITY,
  BOUTIQUE_EXISTE: HttpStatus.CONFLICT,
  NOM_BOUTIQUE_PRIS: HttpStatus.CONFLICT,
  BOUTIQUE_INTROUVABLE: HttpStatus.NOT_FOUND,
  STATUT_BOUTIQUE_INCOMPATIBLE: HttpStatus.CONFLICT,
  BOUTIQUE_SUR_SOI_INTERDITE: HttpStatus.FORBIDDEN,
  PROPRIETAIRE_INACTIF: HttpStatus.CONFLICT,
  BOUTIQUE_OCCUPEE: HttpStatus.CONFLICT,
};

const capitalize = (message: string) => message.charAt(0).toUpperCase() + message.slice(1);

/** Exécute un cas d'utilisation ; une erreur métier devient une réponse HTTP avec son code. */
export async function withVendorsErrors<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof VendorsError) {
      const retryAfter = error.code === "BOUTIQUE_OCCUPEE" ? 1 : undefined;
      throw new BusinessException(
        STATUS[error.code],
        capitalize(error.message),
        error.code,
        retryAfter,
      );
    }
    // Défense en profondeur : la garde HTTP refuse déjà un non-administrateur avant le cas d'utilisation
    if (error instanceof IdentityError && error.code === "ACCES_REFUSE") {
      throw new BusinessException(HttpStatus.FORBIDDEN, capitalize(error.message), error.code);
    }
    throw error;
  }
}

export const VENDORS_ERROR_STATUS = STATUS;
