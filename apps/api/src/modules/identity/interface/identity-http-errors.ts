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
  // Même statut qu'une limite d'envoi : rien n'indique qu'un compte existe (ADR-0017)
  COMPTE_BLOQUE: HttpStatus.TOO_MANY_REQUESTS,
  IDENTIFIANTS_INCORRECTS: HttpStatus.UNAUTHORIZED,
  COMPTE_DESACTIVE: HttpStatus.FORBIDDEN,
  SESSION_INVALIDE: HttpStatus.UNAUTHORIZED,
  ACCES_REFUSE: HttpStatus.FORBIDDEN,
  // 403 et non 401 : la session est valable, mais trop ancienne pour une action d'administration
  RECONNEXION_REQUISE: HttpStatus.FORBIDDEN,
  // Double authentification de l'équipe (S6-T03)
  MOT_DE_PASSE_INCORRECT: HttpStatus.UNPROCESSABLE_ENTITY,
  DEUX_FACTEURS_INDISPONIBLE: HttpStatus.SERVICE_UNAVAILABLE,
  DEUX_FACTEURS_A_CONFIGURER: HttpStatus.CONFLICT,
  DEUX_FACTEURS_DEJA_ACTIVE: HttpStatus.CONFLICT,
  DEUX_FACTEURS_A_ACTIVER: HttpStatus.FORBIDDEN,
  DEUX_FACTEURS_REQUIS: HttpStatus.FORBIDDEN,
  ROLE_NON_ATTRIBUABLE: HttpStatus.FORBIDDEN,
  ROLE_SUR_SOI_INTERDIT: HttpStatus.FORBIDDEN,
  COMPTE_INTROUVABLE: HttpStatus.NOT_FOUND,
  COMPTE_INACTIF: HttpStatus.CONFLICT,
  TROP_DE_REQUETES: HttpStatus.TOO_MANY_REQUESTS,
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
