import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { SecondFactorRecord, SecondFactorRepository } from "../application/ports.js";

type Row = {
  accountId: string;
  secretBox: Uint8Array;
  enabledAt: Date | null;
  lastUsedStep: bigint | null;
};

function toRecord(row: Row): SecondFactorRecord {
  return {
    accountId: row.accountId,
    secretBox: new Uint8Array(row.secretBox),
    enabledAt: row.enabledAt,
    lastUsedStep: row.lastUsedStep === null ? null : Number(row.lastUsedStep),
  };
}

/**
 * Double authentification (schéma `identity`, S6-T03). Rejoint la transaction en cours : activation, codes de secours,
 * confirmation de la session et journal d'audit sont écrits ensemble. Les règles « une période ne recule jamais » et
 * « un code de secours utilisé ne change plus » sont aussi posées par des déclencheurs SQL.
 */
@Injectable()
export class PrismaSecondFactorRepository implements SecondFactorRepository {
  constructor(private readonly tx: TransactionContext) {}

  async find(accountId: string): Promise<SecondFactorRecord | null> {
    const row = await this.tx.db.secondFactor.findUnique({ where: { accountId } });
    return row ? toRecord(row) : null;
  }

  async lock(accountId: string): Promise<SecondFactorRecord | null> {
    const rows = await this.tx.db.$queryRaw<{ account_id: string }[]>`
      SELECT "account_id" FROM "identity"."second_factors" WHERE "account_id" = ${accountId}::uuid FOR UPDATE`;
    return rows[0] ? this.find(accountId) : null;
  }

  async savePending(accountId: string, secretBox: Uint8Array, now: Date): Promise<boolean> {
    // Une seule requête : insertion, ou remplacement d'un secret EN ATTENTE ; jamais d'une 2FA activée
    const changed = await this.tx.db.$executeRaw`
      INSERT INTO "identity"."second_factors" ("account_id", "secret_box", "created_at", "updated_at")
      VALUES (${accountId}::uuid, ${Buffer.from(secretBox)}, ${now}, ${now})
      ON CONFLICT ("account_id") DO UPDATE
        SET "secret_box" = EXCLUDED."secret_box", "last_used_step" = NULL, "updated_at" = EXCLUDED."updated_at"
        WHERE "second_factors"."enabled_at" IS NULL`;
    return changed === 1;
  }

  async enable(accountId: string, step: number, now: Date): Promise<boolean> {
    const { count } = await this.tx.db.secondFactor.updateMany({
      where: { accountId, enabledAt: null },
      data: { enabledAt: now, lastUsedStep: BigInt(step), updatedAt: now },
    });
    return count === 1;
  }

  async useStep(accountId: string, step: number, now: Date): Promise<boolean> {
    const { count } = await this.tx.db.secondFactor.updateMany({
      where: {
        accountId,
        enabledAt: { not: null },
        OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: BigInt(step) } }],
      },
      data: { lastUsedStep: BigInt(step), updatedAt: now },
    });
    return count === 1;
  }

  async replaceRecoveryCodes(
    accountId: string,
    hashes: readonly string[],
    now: Date,
  ): Promise<void> {
    await this.tx.db.recoveryCode.deleteMany({ where: { accountId } });
    await this.tx.db.recoveryCode.createMany({
      data: hashes.map((codeHash) => ({ id: randomUUID(), accountId, codeHash, createdAt: now })),
    });
  }

  async useRecoveryCode(accountId: string, hash: string, now: Date): Promise<boolean> {
    const { count } = await this.tx.db.recoveryCode.updateMany({
      where: { accountId, codeHash: hash, usedAt: null },
      data: { usedAt: now },
    });
    return count === 1;
  }

  countUnusedRecoveryCodes(accountId: string): Promise<number> {
    return this.tx.db.recoveryCode.count({ where: { accountId, usedAt: null } });
  }

  async recordFailure(accountId: string, now: Date, windowMs: number): Promise<number> {
    const windowStart = new Date(now.getTime() - windowMs);
    // Une seule requête : des échecs simultanés sont tous comptés
    const rows = await this.tx.db.$queryRaw<{ failed_count: number }[]>`
      UPDATE "identity"."second_factors" SET
        "failed_count" = CASE WHEN "failed_since" IS NULL OR "failed_since" <= ${windowStart} THEN 1
                              ELSE "failed_count" + 1 END,
        "failed_since" = CASE WHEN "failed_since" IS NULL OR "failed_since" <= ${windowStart} THEN ${now}
                              ELSE "failed_since" END,
        "updated_at" = ${now}
      WHERE "account_id" = ${accountId}::uuid
      RETURNING "failed_count"`;
    return rows[0]?.failed_count ?? 0;
  }

  async remove(accountId: string): Promise<boolean> {
    await this.tx.db.recoveryCode.deleteMany({ where: { accountId } });
    const { count } = await this.tx.db.secondFactor.deleteMany({ where: { accountId } });
    return count === 1;
  }
}
