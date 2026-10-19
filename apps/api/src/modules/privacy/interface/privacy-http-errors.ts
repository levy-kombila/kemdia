import { HttpStatus } from "@nestjs/common";
import { BusinessException } from "../../../http/business-exception.js";
import { withIdentityErrors } from "../../identity/index.js";
import { PrivacyAlreadyErased } from "../application/privacy.service.js";
import { PrivacyError, type DeletionBlocker } from "../domain/privacy.js";

/** Statut HTTP de chaque empêchement : 409, la demande est valable mais pas maintenant. */
const STATUS: Record<DeletionBlocker, number> = {
  COMMANDE_EN_COURS: HttpStatus.CONFLICT,
  REMBOURSEMENT_EN_ATTENTE: HttpStatus.CONFLICT,
  PAIEMENT_EN_ATTENTE: HttpStatus.CONFLICT,
  BOUTIQUE_OUVERTE: HttpStatus.CONFLICT,
  COMPTE_EQUIPE: HttpStatus.CONFLICT,
};

const capitalize = (message: string) => message.charAt(0).toUpperCase() + message.slice(1);

/** Exécute un cas d'utilisation ; une erreur métier (privacy ou identité) devient une réponse HTTP avec son code. */
export function withPrivacyErrors<T>(run: () => Promise<T>): Promise<T> {
  return withIdentityErrors(async () => {
    try {
      return await run();
    } catch (error) {
      if (error instanceof PrivacyError) {
        throw new BusinessException(STATUS[error.code], capitalize(error.message), error.code);
      }
      // Deuxième demande simultanée : la première a déjà effacé le compte et fermé ses sessions
      if (error instanceof PrivacyAlreadyErased) {
        throw new BusinessException(
          HttpStatus.UNAUTHORIZED,
          "Session expirée ou fermée",
          "SESSION_INVALIDE",
        );
      }
      throw error;
    }
  });
}

export const PRIVACY_ERROR_STATUS = STATUS;
