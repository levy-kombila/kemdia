import type { ProblemReport, ProblemStatus } from "../domain/problem-report.js";

export const PROBLEM_REPOSITORY = Symbol("ProblemRepository");
export const FEEDBACK_TRANSACTION = Symbol("FeedbackTransaction");
export const FEEDBACK_RANDOM = Symbol("FeedbackRandom");
export const FEEDBACK_ACCOUNTS = Symbol("FeedbackAccounts");

export interface ProblemCursor {
  createdAt: Date;
  id: string;
}

/** Signalements (schéma `feedback`) ; les écritures rejoignent la transaction en cours. */
export interface ProblemRepository {
  create(report: ProblemReport): Promise<void>;
  findById(id: string): Promise<ProblemReport | null>;
  /**
   * Enregistre le nouvel état SI le signalement n'a pas changé depuis `version` (sa date de modification lue) ;
   * `false` sinon.
   */
  saveIfUnchanged(report: ProblemReport, version: Date): Promise<boolean>;
  /** Signalements pas encore résolus d'un compte. */
  countOpen(accountId: string): Promise<number>;
  /** File du service client : du plus ancien au plus récent, `limit` au plus. */
  list(query: {
    status: ProblemStatus;
    limit: number;
    after?: ProblemCursor | undefined;
  }): Promise<{ items: ProblemReport[]; next: ProblemCursor | null }>;
  ofAccount(accountId: string): Promise<ProblemReport[]>;
  deleteOfAccount(accountId: string): Promise<number>;
  /** Efface les signalements résolus avant cette date ; renvoie leur nombre. */
  purgeResolvedBefore(date: Date): Promise<number>;
}

export interface FeedbackTransaction {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface FeedbackRandom {
  uuid(): string;
}

/** Comment répondre à l'auteur (identity, par son port public). */
export interface FeedbackAccounts {
  contactOf(
    accountId: string,
  ): Promise<{ firstName: string; lastName: string; email: string | null } | null>;
}
