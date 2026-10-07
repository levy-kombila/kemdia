/**
 * Port public du module identity : la SEULE porte d'entrée pour les autres modules (ADR-0006, règle 1).
 * Les modules `orders` (S5) et `admin` liront ici l'identité du client connecté (S4-T03).
 */
export { IdentityModule } from "./identity.module.js";
export { OtpService, type IssuedOtp } from "./application/otp.service.js";
export { SignupService } from "./application/signup.service.js";
export type { Identifier, OtpChannel } from "./domain/identifier.js";
export { IdentityError, type IdentityErrorCode } from "./domain/identity-error.js";
