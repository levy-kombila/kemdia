import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import type { SignupTicket as SignupTicketRow } from "../../../generated/prisma/client.js";
import type { SignupTicket } from "../domain/signup-ticket.js";
import type { SignupTicketRepository } from "../application/ports.js";

function toDomain(row: SignupTicketRow): SignupTicket {
  return {
    id: row.id,
    ticketHash: row.ticketHash,
    destination: row.destination,
    registration:
      row.firstName !== null && row.lastName !== null && row.passwordHash !== null
        ? { firstName: row.firstName, lastName: row.lastName, passwordHash: row.passwordHash }
        : null,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaSignupTicketRepository implements SignupTicketRepository {
  constructor(private readonly prisma: PrismaService) {}

  async replaceForDestination(ticket: SignupTicket): Promise<void> {
    const { registration, ...rest } = ticket;
    // Une transaction : jamais deux inscriptions en cours pour la même destination
    await this.prisma.$transaction([
      this.prisma.signupTicket.deleteMany({ where: { destination: ticket.destination } }),
      this.prisma.signupTicket.create({
        data: {
          ...rest,
          firstName: registration?.firstName ?? null,
          lastName: registration?.lastName ?? null,
          passwordHash: registration?.passwordHash ?? null,
        },
      }),
    ]);
  }

  async findByHash(ticketHash: string): Promise<SignupTicket | null> {
    const row = await this.prisma.signupTicket.findUnique({ where: { ticketHash } });
    return row ? toDomain(row) : null;
  }

  async deleteForDestination(destination: string): Promise<void> {
    await this.prisma.signupTicket.deleteMany({ where: { destination } });
  }
}
