import { Module } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuditModule } from "../audit/index.js";
import { AccountDirectory, IdentityModule } from "../identity/index.js";
import {
  FEEDBACK_ACCOUNTS,
  FEEDBACK_RANDOM,
  FEEDBACK_TRANSACTION,
  PROBLEM_REPOSITORY,
} from "./application/ports.js";
import { ProblemService } from "./application/problem.service.js";
import { FeedbackCleanupScheduler } from "./infrastructure/feedback-maintenance.js";
import { FeedbackPersonalData } from "./infrastructure/feedback-personal-data.js";
import { FeedbackTransactionRunner } from "./infrastructure/feedback-transaction.js";
import { PrismaProblemRepository } from "./infrastructure/prisma-problem.repository.js";
import { AdminProblemController, ProblemController } from "./interface/problem.controller.js";

/**
 * « Signaler un problème » pendant la bêta (S8-T02, ADR-0057) : signalements des comptes connectés, suivis par le
 * service client. Les auteurs sont lus par le port public d'identity (annuaire des comptes).
 */
@Module({
  imports: [IdentityModule, AuditModule],
  controllers: [ProblemController, AdminProblemController],
  providers: [
    ProblemService,
    FeedbackPersonalData,
    FeedbackCleanupScheduler,
    { provide: PROBLEM_REPOSITORY, useClass: PrismaProblemRepository },
    { provide: FEEDBACK_TRANSACTION, useClass: FeedbackTransactionRunner },
    { provide: FEEDBACK_RANDOM, useValue: { uuid: () => randomUUID() } },
    { provide: FEEDBACK_ACCOUNTS, useExisting: AccountDirectory },
  ],
  exports: [FeedbackPersonalData],
})
export class FeedbackModule {}
