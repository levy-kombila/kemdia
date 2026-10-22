import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { KnownDeviceRepository } from "../application/ports.js";

/**
 * Appareils déjà utilisés pour se connecter (S7.5-T04, ADR-0051) : seulement des empreintes SHA-256. Chaque écriture
 * se fait sous le verrou du compte : deux connexions simultanées depuis un même appareil inconnu ne donnent qu'un avis.
 */
@Injectable()
export class PrismaKnownDeviceRepository implements KnownDeviceRepository {
  constructor(private readonly tx: TransactionContext) {}

  sight(input: {
    id: string;
    accountId: string;
    deviceHash: string;
    userAgent: string | null;
    alertTokenHash: string;
    alertExpiresAt: Date;
    now: Date;
    max: number;
  }): Promise<"known" | "first" | "new"> {
    return this.tx.run(async () => {
      const db = this.tx.db;
      await db.$executeRaw`
        SELECT 1 FROM "identity"."accounts" WHERE "id" = ${input.accountId}::uuid FOR UPDATE`;
      const seen = await db.knownDevice.updateMany({
        where: { accountId: input.accountId, deviceHash: input.deviceHash },
        data: { lastSeenAt: input.now },
      });
      if (seen.count > 0) return "known";
      const first = (await db.knownDevice.count({ where: { accountId: input.accountId } })) === 0;
      await db.knownDevice.create({
        data: {
          id: input.id,
          accountId: input.accountId,
          deviceHash: input.deviceHash,
          userAgent: input.userAgent,
          createdAt: input.now,
          lastSeenAt: input.now,
          ...(first
            ? {}
            : { alertTokenHash: input.alertTokenHash, alertExpiresAt: input.alertExpiresAt }),
        },
      });
      // Au plus `max` appareils retenus : les moins récemment utilisés sont oubliés
      const keep = await db.knownDevice.findMany({
        where: { accountId: input.accountId },
        orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
        take: input.max,
        select: { id: true },
      });
      await db.knownDevice.deleteMany({
        where: { accountId: input.accountId, id: { notIn: keep.map((d) => d.id) } },
      });
      return first ? "first" : "new";
    });
  }

  async consumeAlert(tokenHash: string, now: Date): Promise<{ accountId: string } | null> {
    // Une seule requête : deux clics simultanés ne consomment le jeton qu'une fois
    const rows = await this.tx.db.$queryRaw<{ account_id: string }[]>`
      DELETE FROM "identity"."known_devices"
      WHERE "alert_token_hash" = ${tokenHash} AND "alert_expires_at" > ${now}
      RETURNING "account_id"`;
    return rows[0] ? { accountId: rows[0].account_id } : null;
  }
}
