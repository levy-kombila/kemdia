import { Inject, Injectable } from "@nestjs/common";
import { PROBLEM_REPOSITORY, type ProblemRepository } from "../application/ports.js";

/**
 * Données personnelles du module feedback (S8-T02, ADR-0047) : copie des signalements du titulaire et effacement,
 * dans la transaction partagée du module privacy.
 */
@Injectable()
export class FeedbackPersonalData {
  constructor(@Inject(PROBLEM_REPOSITORY) private readonly problems: ProblemRepository) {}

  async export(accountId: string): Promise<Record<string, unknown>[]> {
    const mine = await this.problems.ofAccount(accountId);
    return mine.map((r) => ({
      genre: r.category,
      description: r.message,
      page: r.page,
      appareil: r.device,
      etat: r.status,
      envoyeLe: r.createdAt,
      modifieLe: r.updatedAt,
    }));
  }

  async erase(accountId: string): Promise<void> {
    await this.problems.deleteOfAccount(accountId);
  }
}
