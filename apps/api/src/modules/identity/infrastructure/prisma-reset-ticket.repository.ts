import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import type { ResetTicket } from "../domain/reset-ticket.js";
import type { PasswordResetChange, ResetTicketRepository } from "../application/ports.js";

@Injectable()
export class PrismaResetTicketRepository implements ResetTicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceForDestination(ticket: ResetTicket): Promise<void> {
    // Une transaction : jamais deux demandes en cours pour la même adresse
    await this.prisma.$transaction([
      this.prisma.resetTicket.deleteMany({ where: { destination: ticket.destination } }),
      this.prisma.resetTicket.create({ data: ticket }),
    ]);
  }

  findByHash(ticketHash: string): Promise<ResetTicket | null> {
    return this.prisma.resetTicket.findUnique({ where: { ticketHash } });
  }

  async deleteForDestination(destination: string): Promise<void> {
    await this.prisma.resetTicket.deleteMany({ where: { destination } });
  }

  async applyReset(change: PasswordResetChange): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      // Mise à jour ciblée : seulement si le compte est encore actif et n'a pas changé de mot de passe
      const { count } = await tx.account.updateMany({
        where: { id: change.accountId, status: "ACTIVE", passwordVersion: change.expectedVersion },
        data: { passwordHash: change.passwordHash, passwordVersion: { increment: 1 } },
      });
      if (count !== 1) return false;
      await tx.resetTicket.deleteMany({ where: { destination: change.destination } });
      await tx.session.updateMany({
        where: { accountId: change.accountId, revokedAt: null },
        data: { revokedAt: change.now },
      });
      await tx.loginGuard.deleteMany({ where: { identifier: { in: change.guardIdentifiers } } });
      return true;
    });
  }
}
