import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { Session } from "../domain/session.js";
import type { SessionRepository } from "../application/ports.js";

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  /** Rejoint la transaction en cours s'il y en a une (« tous mes appareils » + journal d'audit, S4-T06) */
  constructor(private readonly tx: TransactionContext) {}

  async create(session: Session): Promise<void> {
    await this.tx.db.session.create({ data: session });
    await this.markActive(session.accountId, session.createdAt);
  }

  /**
   * Activité du compte (S7-T08) : connexion ou session prolongée (au plus une fois par heure). Un avis d'inactivité
   * envoyé avant est annulé : le compte ne sera pas effacé.
   */
  private async markActive(accountId: string, now: Date): Promise<void> {
    await this.tx.db.account.updateMany({
      where: { id: accountId, deletedAt: null },
      data: { lastActiveAt: now, inactivityNoticeAt: null },
    });
  }

  findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.tx.db.session.findUnique({ where: { tokenHash } });
  }

  async renew(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void> {
    // Jamais sur une session révoquée entre-temps
    const renewed = await this.tx.db.session.updateManyAndReturn({
      where: { id, revokedAt: null },
      data: { expiresAt, lastSeenAt },
      select: { accountId: true },
    });
    if (renewed[0]) await this.markActive(renewed[0].accountId, lastSeenAt);
  }

  async revoke(id: string, now: Date): Promise<void> {
    await this.tx.db.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async confirmSecondFactor(id: string, now: Date): Promise<void> {
    // Jamais sur une session fermée entre-temps
    await this.tx.db.session.updateMany({
      where: { id, revokedAt: null },
      data: { secondFactorAt: now },
    });
  }

  async revokeAllForAccount(accountId: string, now: Date): Promise<number> {
    const { count } = await this.tx.db.session.updateMany({
      where: { accountId, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    return count;
  }
}
