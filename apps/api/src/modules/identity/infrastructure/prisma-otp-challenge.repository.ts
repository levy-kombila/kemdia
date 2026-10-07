import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import type { OtpChallenge as OtpChallengeRow } from "../../../generated/prisma/client.js";
import type { OtpChannel } from "../domain/identifier.js";
import { OtpChallenge, type OtpPurpose } from "../domain/otp.js";
import type { OtpChallengeRepository } from "../application/ports.js";

const PURPOSE_TO_DB = { signup: "SIGNUP", reset: "RESET" } as const;
const PURPOSE_FROM_DB = { SIGNUP: "signup", RESET: "reset" } as const satisfies Record<
  OtpChallengeRow["purpose"],
  OtpPurpose
>;
const CHANNEL_TO_DB = { email: "EMAIL", sms: "SMS" } as const;
const CHANNEL_FROM_DB = { EMAIL: "email", SMS: "sms" } as const satisfies Record<
  OtpChallengeRow["channel"],
  OtpChannel
>;

function toDomain(row: OtpChallengeRow): OtpChallenge {
  return OtpChallenge.restore({
    id: row.id,
    purpose: PURPOSE_FROM_DB[row.purpose],
    channel: CHANNEL_FROM_DB[row.channel],
    destination: row.destination,
    codeHash: row.codeHash,
    attempts: row.attempts,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    createdAt: row.createdAt,
  });
}

/** Les compteurs d'envoi sont lus dans cette table (index destination + date) : pas de Redis (ADR-0015). */
@Injectable()
export class PrismaOtpChallengeRepository implements OtpChallengeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(challenge: OtpChallenge): Promise<void> {
    const s = challenge.snapshot();
    await this.prisma.otpChallenge.create({
      data: {
        ...s,
        purpose: PURPOSE_TO_DB[s.purpose],
        channel: CHANNEL_TO_DB[s.channel],
      },
    });
  }

  async findLatest(destination: string, purpose: OtpPurpose): Promise<OtpChallenge | null> {
    const row = await this.prisma.otpChallenge.findFirst({
      where: { destination, purpose: PURPOSE_TO_DB[purpose] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return row ? toDomain(row) : null;
  }

  async lastSentAt(destination: string): Promise<Date | null> {
    const row = await this.prisma.otpChallenge.findFirst({
      where: { destination },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    return row?.createdAt ?? null;
  }

  countSentSince(destination: string, since: Date): Promise<number> {
    return this.prisma.otpChallenge.count({ where: { destination, createdAt: { gte: since } } });
  }

  async save(challenge: OtpChallenge): Promise<void> {
    const { id, attempts, consumedAt } = challenge.snapshot();
    // Seuls les essais et la consommation changent après la création
    await this.prisma.otpChallenge.update({ where: { id }, data: { attempts, consumedAt } });
  }
}
