import { Logger, Module } from "@nestjs/common";
import { AvatarService } from "./application/avatar.service.js";
import { AvatarController } from "./interface/avatar.controller.js";
import { PrismaAvatarStore } from "./infrastructure/prisma-avatar.store.js";
import { SharpAvatarProcessor } from "./infrastructure/sharp-avatar-processor.js";
import { APP_CONFIG } from "../../config/config.module.js";
import { AuditModule } from "../audit/index.js";
import type { AppConfig } from "../../config/env.js";
import { LoginService } from "./application/login.service.js";
import { OtpService } from "./application/otp.service.js";
import { PasswordChangeService } from "./application/password-change.service.js";
import { PasswordConfirmationService } from "./application/password-confirmation.service.js";
import { PasswordResetService } from "./application/password-reset.service.js";
import { RoleService } from "./application/role.service.js";
import { SecondFactorService } from "./application/second-factor.service.js";
import { SessionService } from "./application/session.service.js";
import { SignupService } from "./application/signup.service.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  AVATAR_PROCESSOR,
  AVATAR_STORE,
  IDENTITY_MAINTENANCE,
  LOGIN_GUARD_REPOSITORY,
  IDENTITY_OPTIONS,
  OTP_CHALLENGE_REPOSITORY,
  OTP_SENDER,
  PASSWORD_HASHER,
  RESET_TICKET_REPOSITORY,
  ROLE_REPOSITORY,
  SECOND_FACTOR_REPOSITORY,
  SECRET_BOX,
  SESSION_REPOSITORY,
  TRANSACTION_RUNNER,
  SIGNUP_TICKET_REPOSITORY,
  STAFF_DIRECTORY,
  KNOWN_DEVICE_REPOSITORY,
  type IdentityOptions,
} from "./application/ports.js";
import { AesSecretBox } from "./infrastructure/aes-secret-box.js";
import { Argon2PasswordHasher } from "./infrastructure/argon2-password-hasher.js";
import { PrismaSecondFactorRepository } from "./infrastructure/prisma-second-factor.repository.js";
import {
  IdentityCleanupScheduler,
  PrismaIdentityMaintenance,
} from "./infrastructure/identity-maintenance.js";
import { AccountDirectory } from "./application/account-directory.service.js";
import { createOtpSender } from "./infrastructure/otp-sender.factory.js";
import { PrismaLoginGuardRepository } from "./infrastructure/prisma-login-guard.repository.js";
import { PrismaRoleRepository } from "./infrastructure/prisma-role.repository.js";
import { PrismaTransactionRunner } from "./infrastructure/prisma-transaction-runner.js";
import { PrismaResetTicketRepository } from "./infrastructure/prisma-reset-ticket.repository.js";
import { PrismaSessionRepository } from "./infrastructure/prisma-session.repository.js";
import { PrismaAccountRepository } from "./infrastructure/prisma-account.repository.js";
import { PrismaOtpChallengeRepository } from "./infrastructure/prisma-otp-challenge.repository.js";
import { PrismaSignupTicketRepository } from "./infrastructure/prisma-signup-ticket.repository.js";
import { AdminController } from "./interface/admin.controller.js";
import { IdentityController } from "./interface/identity.controller.js";
import { RoleGuard } from "./interface/role.guard.js";
import { SecondFactorController } from "./interface/second-factor.controller.js";
import { SessionGuard } from "./interface/session.guard.js";
import { IdentityPersonalData } from "./infrastructure/identity-personal-data.js";

import { DeviceService } from "./application/device.service.js";
import { StaffAccountService } from "./application/staff-account.service.js";
import { SupportService } from "./application/support.service.js";
import { PrismaKnownDeviceRepository } from "./infrastructure/prisma-known-device.repository.js";
import { PrismaStaffDirectory } from "./infrastructure/prisma-staff-directory.repository.js";
import { SupportController } from "./interface/support.controller.js";

/**
 * Module identity (S4, ADR-0015) : comptes, codes à usage unique, sessions.
 * Routes : interface/identity.controller.ts (`/api/v1/auth/…`) — inscription (S4-T02), connexion et sessions (S4-T03) ;
 * interface/admin.controller.ts (`/api/v1/admin/…`) — rôles et journal d'audit (S4-T06) ;
 * interface/second-factor.controller.ts (`/api/v1/auth/2fa/…`) — double authentification de l'équipe (S6-T03).
 */
@Module({
  // Journal d'audit : mot de passe réinitialisé, « tous mes appareils », rôles (S4-T06)
  imports: [AuditModule],
  controllers: [
    IdentityController,
    AdminController,
    SecondFactorController,
    SupportController,
    AvatarController,
  ],
  providers: [
    // Données personnelles (S7-T08) : copie, effacement — utilisé par le module privacy
    IdentityPersonalData,
    RoleService,
    // Photo de profil (S7.5-T08, ADR-0055)
    AvatarService,
    { provide: AVATAR_PROCESSOR, useClass: SharpAvatarProcessor },
    { provide: AVATAR_STORE, useClass: PrismaAvatarStore },
    RoleGuard,
    // Équipe, service client et appareils (S7.5-T04, ADR-0051)
    StaffAccountService,
    SupportService,
    DeviceService,
    { provide: STAFF_DIRECTORY, useClass: PrismaStaffDirectory },
    { provide: KNOWN_DEVICE_REPOSITORY, useClass: PrismaKnownDeviceRepository },
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    { provide: TRANSACTION_RUNNER, useClass: PrismaTransactionRunner },
    OtpService,
    SignupService,
    LoginService,
    SessionService,
    PasswordResetService,
    PasswordChangeService,
    PasswordConfirmationService,
    { provide: RESET_TICKET_REPOSITORY, useClass: PrismaResetTicketRepository },
    SessionGuard,
    PrismaIdentityMaintenance,
    IdentityCleanupScheduler,
    { provide: IDENTITY_MAINTENANCE, useExisting: PrismaIdentityMaintenance },
    { provide: LOGIN_GUARD_REPOSITORY, useClass: PrismaLoginGuardRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: SIGNUP_TICKET_REPOSITORY, useClass: PrismaSignupTicketRepository },
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
    AccountDirectory,
    { provide: OTP_CHALLENGE_REPOSITORY, useClass: PrismaOtpChallengeRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: OTP_SENDER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => createOtpSender(c) },
    { provide: IDENTITY_CLOCK, useValue: { now: () => new Date() } },
    // Double authentification de l'équipe (S6-T03, ADR-0034, MED-15)
    SecondFactorService,
    { provide: SECOND_FACTOR_REPOSITORY, useClass: PrismaSecondFactorRepository },
    {
      provide: SECRET_BOX,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig) => {
        const box = new AesSecretBox(c);
        const logger = new Logger("Double authentification");
        if (box.usesDevelopmentKey && c.NODE_ENV !== "test") {
          logger.warn(
            "clé de développement (publique) : TOTP_ENCRYPTION_KEY absente — local ou démo seulement",
          );
        } else if (!box.available) {
          logger.warn(
            "TOTP_ENCRYPTION_KEY absente : double authentification indisponible, routes d'équipe fermées",
          );
        }
        return box;
      },
    },
    {
      provide: IDENTITY_OPTIONS,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): IdentityOptions => ({
        smsEnabled: c.SMS_ENABLED,
        siteUrl: c.PUBLIC_SITE_URL ? new URL(c.PUBLIC_SITE_URL).origin : null,
      }),
    },
  ],
  // Les autres modules protègent leurs routes avec SessionGuard ou @Authorize (S5 : commandes, S6 : vendeurs)
  exports: [
    IdentityPersonalData,
    // Le module privacy confirme la suppression du compte par le mot de passe actuel (S7-T08)
    PasswordConfirmationService,
    OtpService,
    SessionService,
    SessionGuard,
    RoleGuard,
    IDENTITY_CLOCK,
    AccountDirectory,
    // Le module vendors accorde et retire le rôle vendeur à la décision sur une boutique (S6-T01)
    RoleService,
    // RoleGuard vérifie la double authentification des routes d'équipe (S6-T03) ; la commande mfa:reset l'utilise
    SECOND_FACTOR_REPOSITORY,
    SecondFactorService,
    // Le module orders vérifie le rôle « support » avant de montrer les commandes d'un client (S7.5-T04)
    SupportService,
  ],
})
export class IdentityModule {}
