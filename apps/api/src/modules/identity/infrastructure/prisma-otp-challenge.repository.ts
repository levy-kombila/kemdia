import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import type { OtpChallenge as OtpChallengeRow } from "../../../generated/prisma/client.js";
import type { OtpChannel } from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import { OTP_MAX_ATTEMPTS, OtpChallenge, type OtpPurpose } from "../domain/otp.js";
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
const HOUR_MS = 60 * 60_000;

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

/**
 * Codes à usage unique dans PostgreSQL (ADR-0015, ADR-0016). Les opérations sensibles sont atomiques :
 * - création sous verrou par destination (limites d'envoi) ;
 * - essai compté par `UPDATE … SET attempts = attempts + 1 … WHERE attempts < 5` ;
 * - consommation par `UPDATE … WHERE consumed_at IS NULL`.
 */
@Injectable()
export class PrismaOtpChallengeRepository implements OtpChallengeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createWithinLimits(
    challenge: OtpChallenge,
    check: (sentLastHour: Date[]) => void,
  ): Promise<void> {
    const s = challenge.snapshot();
    const purpose = PURPOSE_TO_DB[s.purpose];
    await this.prisma.$transaction(async (tx) => {
      // Verrou propre à cette destination, libéré à la fin de la transaction. « try » : si une autre demande
      // pour la même adresse le tient déjà, on refuse tout de suite (429) au lieu d'attendre en occupant
      // une connexion à la base — une rafale de demandes ne peut pas épuiser les connexions de l'API.
      const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(hashtextextended(${`otp:${s.destination}`}, 0)) AS "locked"`;
      if (!lock?.locked) {
        throw new IdentityError(
          "ENVOI_TROP_RAPPROCHE",
          "une demande de code est déjà en cours : réessayez dans quelques secondes",
          5,
        );
      }
      const rows = await tx.otpChallenge.findMany({
        where: {
          destination: s.destination,
          purpose,
          createdAt: { gt: new Date(s.createdAt.getTime() - HOUR_MS) },
        },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
        take: 50,
      });
      check(rows.map((r) => r.createdAt));
      await tx.otpChallenge.create({
        data: { ...s, purpose, channel: CHANNEL_TO_DB[s.channel] },
      });
    });
  }

  async findLatest(destination: string, purpose: OtpPurpose): Promise<OtpChallenge | null> {
    const row = await this.prisma.otpChallenge.findFirst({
      where: { destination, purpose: PURPOSE_TO_DB[purpose] },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return row ? toDomain(row) : null;
  }

  async claimAttempt(id: string, now: Date): Promise<number | null> {
    const rows = await this.prisma.$queryRaw<{ attempts: number }[]>`
      UPDATE "identity"."otp_challenges"
      SET "attempts" = "attempts" + 1
      WHERE "id" = ${id}::uuid
        AND "attempts" < ${OTP_MAX_ATTEMPTS}
        AND "consumed_at" IS NULL
        AND "expires_at" > ${now}
      RETURNING "attempts"`;
    return rows[0]?.attempts ?? null;
  }

  async consume(id: string, now: Date): Promise<boolean> {
    const { count } = await this.prisma.otpChallenge.updateMany({
      where: { id, consumedAt: null },
      data: { consumedAt: now },
    });
    return count === 1;
  }
}
