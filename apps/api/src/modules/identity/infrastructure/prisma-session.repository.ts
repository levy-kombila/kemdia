import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import type { Session } from "../domain/session.js";
import type { SessionRepository } from "../application/ports.js";

@Injectable()
export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(session: Session): Promise<void> {
    await this.prisma.session.create({ data: session });
  }

  findByTokenHash(tokenHash: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { tokenHash } });
  }

  async renew(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void> {
    // Jamais sur une session révoquée entre-temps
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { expiresAt, lastSeenAt },
    });
  }

  async revoke(id: string, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  async revokeAllForAccount(accountId: string, now: Date): Promise<number> {
    const { count } = await this.prisma.session.updateMany({
      where: { accountId, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now },
    });
    return count;
  }
}
