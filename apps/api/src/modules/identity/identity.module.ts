import { Module } from "@nestjs/common";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import { LoginService } from "./application/login.service.js";
import { OtpService } from "./application/otp.service.js";
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
  SESSION_REPOSITORY,
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
import { PrismaSessionRepository } from "./infrastructure/prisma-session.repository.js";
import { PrismaAccountRepository } from "./infrastructure/prisma-account.repository.js";
import { PrismaOtpChallengeRepository } from "./infrastructure/prisma-otp-challenge.repository.js";
import { PrismaSignupTicketRepository } from "./infrastructure/prisma-signup-ticket.repository.js";
import { IdentityController } from "./interface/identity.controller.js";
import { SessionGuard } from "./interface/session.guard.js";

/**
 * Module identity (S4, ADR-0015) : comptes, codes à usage unique, sessions.
 * Routes : interface/identity.controller.ts (`/api/v1/auth/…`) — inscription (S4-T02), connexion et sessions (S4-T03).
 */
@Module({
  controllers: [IdentityController],
  providers: [
    OtpService,
    SignupService,
    LoginService,
    SessionService,
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
  // Les autres modules protègent leurs routes avec SessionGuard (S5 : commandes)
  exports: [OtpService, SessionService, SessionGuard],
})
export class IdentityModule {}
