/**
 * Port public du module identity : la SEULE porte d'entrée pour les autres modules (ADR-0006, règle 1).
 * Les modules `orders` (S5) et `admin` liront ici l'identité du client connecté (S4-T03).
 */
export { IdentityModule } from "./identity.module.js";
export { OtpService, type IssuedOtp } from "./application/otp.service.js";
export { SignupService } from "./application/signup.service.js";
export { SessionService, type AuthenticatedSession } from "./application/session.service.js";
export {
  SessionGuard,
  CurrentSession,
  AccountRateLimit,
  DEFAULT_ACCOUNT_LIMIT,
} from "./interface/session.guard.js";
export { Authorize, RoleGuard } from "./interface/role.guard.js";
export { RoleService } from "./application/role.service.js";
export { SecondFactorService } from "./application/second-factor.service.js";
export { AccountDirectory, type AccountContact } from "./application/account-directory.service.js";
export { ROLES, hasRole, type Role } from "./domain/role.js";
export type { AccountView } from "./domain/account.js";
export type { Identifier, OtpChannel } from "./domain/identifier.js";
export { IdentityError, type IdentityErrorCode } from "./domain/identity-error.js";
/** Données personnelles du module (S7-T08) : copie et effacement, pour le module privacy */
export { IdentityPersonalData } from "./infrastructure/identity-personal-data.js";
export {
  PasswordConfirmationService,
  type ConfirmedAction,
} from "./application/password-confirmation.service.js";
/** Conversion des erreurs d'identité en réponses HTTP (le module privacy confirme le mot de passe, S7-T08) */
export { withIdentityErrors } from "./interface/identity-http-errors.js";
