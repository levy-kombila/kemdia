import { Module } from "@nestjs/common";
import { APP_CONFIG } from "../../config/config.module.js";
import { AuditModule } from "../audit/index.js";
import type { AppConfig } from "../../config/env.js";
import { LoginService } from "./application/login.service.js";
import { OtpService } from "./application/otp.service.js";
import { PasswordResetService } from "./application/password-reset.service.js";
import { RoleService } from "./application/role.service.js";
import { SessionService } from "./application/session.service.js";
import { SignupService } from "./application/signup.service.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  IDENTITY_MAINTENANCE,
  LOGIN_GUARD_REPOSITORY,
  IDENTITY_OPTIONS,
  OTP_CHALLENGE_REPOSITORY,
  OTP_SENDER,
  PASSWORD_HASHER,
  RESET_TICKET_REPOSITORY,
  ROLE_REPOSITORY,
  SESSION_REPOSITORY,
  TRANSACTION_RUNNER,
  SIGNUP_TICKET_REPOSITORY,
  type IdentityOptions,
} from "./application/ports.js";
import { Argon2PasswordHasher } from "./infrastructure/argon2-password-hasher.js";
import {
  IdentityCleanupScheduler,
  PrismaIdentityMaintenance,
} from "./infrastructure/identity-maintenance.js";
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
import { SessionGuard } from "./interface/session.guard.js";

/**
 * Module identity (S4, ADR-0015) : comptes, codes à usage unique, sessions.
 * Routes : interface/identity.controller.ts (`/api/v1/auth/…`) — inscription (S4-T02), connexion et sessions (S4-T03) ;
 * interface/admin.controller.ts (`/api/v1/admin/…`) — rôles et journal d'audit (S4-T06).
 */
@Module({
  // Journal d'audit : mot de passe réinitialisé, « tous mes appareils », rôles (S4-T06)
  imports: [AuditModule],
  controllers: [IdentityController, AdminController],
  providers: [
    RoleService,
    RoleGuard,
    { provide: ROLE_REPOSITORY, useClass: PrismaRoleRepository },
    { provide: TRANSACTION_RUNNER, useClass: PrismaTransactionRunner },
    OtpService,
    SignupService,
    LoginService,
    SessionService,
    PasswordResetService,
    { provide: RESET_TICKET_REPOSITORY, useClass: PrismaResetTicketRepository },
    SessionGuard,
    PrismaIdentityMaintenance,
    IdentityCleanupScheduler,
    { provide: IDENTITY_MAINTENANCE, useExisting: PrismaIdentityMaintenance },
    { provide: LOGIN_GUARD_REPOSITORY, useClass: PrismaLoginGuardRepository },
    { provide: SESSION_REPOSITORY, useClass: PrismaSessionRepository },
    { provide: SIGNUP_TICKET_REPOSITORY, useClass: PrismaSignupTicketRepository },
    { provide: ACCOUNT_REPOSITORY, useClass: PrismaAccountRepository },
    { provide: OTP_CHALLENGE_REPOSITORY, useClass: PrismaOtpChallengeRepository },
    { provide: PASSWORD_HASHER, useClass: Argon2PasswordHasher },
    { provide: OTP_SENDER, inject: [APP_CONFIG], useFactory: (c: AppConfig) => createOtpSender(c) },
    { provide: IDENTITY_CLOCK, useValue: { now: () => new Date() } },
    {
      provide: IDENTITY_OPTIONS,
      inject: [APP_CONFIG],
      useFactory: (c: AppConfig): IdentityOptions => ({ smsEnabled: c.SMS_ENABLED }),
    },
  ],
  // Les autres modules protègent leurs routes avec SessionGuard ou @Authorize (S5 : commandes, S6 : vendeurs)
  exports: [OtpService, SessionService, SessionGuard, RoleGuard, IDENTITY_CLOCK],
})
export class IdentityModule {}
