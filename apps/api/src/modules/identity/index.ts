/**
 * Port public du module identity : la SEULE porte d'entrée pour les autres modules (ADR-0006, règle 1).
 * Les modules `orders` (S5) et `admin` liront ici l'identité du client connecté (S4-T03).
 */
export { IdentityModule } from "./identity.module.js";
export { OtpService, type IssuedOtp } from "./application/otp.service.js";
export { SignupService } from "./application/signup.service.js";
export { SessionService, type AuthenticatedSession } from "./application/session.service.js";
export { SessionGuard, CurrentSession } from "./interface/session.guard.js";
export { Authorize, RoleGuard } from "./interface/role.guard.js";
export { RoleService } from "./application/role.service.js";
export { ROLES, hasRole, type Role } from "./domain/role.js";
export type { AccountView } from "./domain/account.js";
export type { Identifier, OtpChannel } from "./domain/identifier.js";
export { IdentityError, type IdentityErrorCode } from "./domain/identity-error.js";
