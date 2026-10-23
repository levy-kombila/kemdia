import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import { FeedbackError } from "../domain/feedback-error.js";
import {
  PROBLEM_RULES,
  changeStatus,
  newProblemReport,
  type ProblemCategory,
  type ProblemReport,
  type ProblemStatus,
} from "../domain/problem-report.js";
import {
  FEEDBACK_ACCOUNTS,
  FEEDBACK_RANDOM,
  FEEDBACK_TRANSACTION,
  PROBLEM_REPOSITORY,
  type FeedbackAccounts,
  type FeedbackRandom,
  type FeedbackTransaction,
  type ProblemCursor,
  type ProblemRepository,
} from "./ports.js";

export interface Reporter {
  name: string;
  email: string | null;
}

/**
 * « Signaler un problème » (S8-T02, ADR-0057). Réservé aux comptes connectés (testeurs et vendeurs de la bêta) :
 * 20 signalements non résolus au plus par compte. Le service client les lit et les fait avancer ; chaque changement
 * d'état est journalisé.
 */
@Injectable()
export class ProblemService {
  clock: () => Date = () => new Date();

  constructor(
    @Inject(PROBLEM_REPOSITORY) private readonly problems: ProblemRepository,
    @Inject(FEEDBACK_TRANSACTION) private readonly tx: FeedbackTransaction,
    @Inject(FEEDBACK_RANDOM) private readonly random: FeedbackRandom,
    @Inject(FEEDBACK_ACCOUNTS) private readonly accounts: FeedbackAccounts,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
  ) {}

  async report(
    accountId: string,
    input: { category: ProblemCategory; message: string; page?: string | null | undefined },
    device: string | null,
  ): Promise<ProblemReport> {
    const report = newProblemReport({
      id: this.random.uuid(),
      accountId,
      ...input,
      device,
      now: this.clock(),
    });
    if ((await this.problems.countOpen(accountId)) >= PROBLEM_RULES.openPerAccount) {
      throw new FeedbackError(
        "TROP_DE_SIGNALEMENTS",
        `${PROBLEM_RULES.openPerAccount} signalements attendent déjà une réponse : merci de patienter`,
      );
    }
    await this.problems.create(report);
    return report;
  }

  /** File du service client, avec de quoi répondre à chaque auteur. */
  async queue(query: {
    status: ProblemStatus;
    limit: number;
    after?: ProblemCursor | undefined;
  }): Promise<{
    items: { report: ProblemReport; reporter: Reporter | null }[];
    next: ProblemCursor | null;
  }> {
    const page = await this.problems.list(query);
    const items = [];
    // L'un après l'autre : 100 au plus, et la base garde peu de connexions
    for (const report of page.items) {
      items.push({ report, reporter: await this.reporterOf(report.accountId) });
    }
    return { items, next: page.next };
  }

  /** Nouvel état ; refusé si le signalement a changé depuis sa lecture (`version`). */
  setStatus(
    staffId: string,
    id: string,
    to: ProblemStatus,
    version: Date,
    context: AuditContext,
  ): Promise<{ report: ProblemReport; reporter: Reporter | null }> {
    return this.tx.run(async () => {
      const report = await this.problems.findById(id);
      if (!report) throw new FeedbackError("SIGNALEMENT_INTROUVABLE", "signalement introuvable");
      if (report.updatedAt.getTime() !== version.getTime()) throw changed();
      const next = changeStatus(report, to, staffId, this.clock());
      if (next !== report) {
        if (!(await this.problems.saveIfUnchanged(next, version))) throw changed();
        await this.audit.record({
          action: "problem.updated",
          actor: { type: "account", id: staffId },
          target: { type: "problem", id },
          details: { from: report.status, to },
          context,
        });
      }
      return { report: next, reporter: await this.reporterOf(next.accountId) };
    });
  }

  private async reporterOf(accountId: string): Promise<Reporter | null> {
    const contact = await this.accounts.contactOf(accountId);
    return contact
      ? { name: `${contact.firstName} ${contact.lastName}`.trim(), email: contact.email }
      : null;
  }
}

function changed(): FeedbackError {
  return new FeedbackError(
    "SIGNALEMENT_MODIFIE",
    "ce signalement vient d'être modifié par un collègue : la page a été rechargée",
  );
}
