import { Module } from "@nestjs/common";
import { APP_CONFIG } from "../../config/config.module.js";
import type { AppConfig } from "../../config/env.js";
import { OtpService } from "./application/otp.service.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  IDENTITY_OPTIONS,
  OTP_CHALLENGE_REPOSITORY,
  OTP_SENDER,
  PASSWORD_HASHER,
  type IdentityOptions,
} from "./application/ports.js";
import { Argon2PasswordHasher } from "./infrastructure/argon2-password-hasher.js";
import { createOtpSender } from "./infrastructure/otp-sender.factory.js";
import { PrismaAccountRepository } from "./infrastructure/prisma-account.repository.js";
import { PrismaOtpChallengeRepository } from "./infrastructure/prisma-otp-challenge.repository.js";

/**
 * Module identity (S4, ADR-0015) : comptes, codes à usage unique, sessions.
 * S4-T01 pose les fondations (domaine, tables, hachage, codes) ; les routes arrivent avec S4-T02 et S4-T03.
 */
@Module({
  providers: [
    OtpService,
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
  exports: [OtpService],
})
export class IdentityModule {}
