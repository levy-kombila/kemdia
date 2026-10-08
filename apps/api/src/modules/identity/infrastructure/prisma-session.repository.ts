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
  }

  findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.tx.db.session.findUnique({ where: { tokenHash } });
  }

  async renew(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void> {
    // Jamais sur une session révoquée entre-temps
    await this.tx.db.session.updateMany({
      where: { id, revokedAt: null },
      data: { expiresAt, lastSeenAt },
    });
  }

  async revoke(id: string, now: Date): Promise<void> {
    await this.tx.db.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now },
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
