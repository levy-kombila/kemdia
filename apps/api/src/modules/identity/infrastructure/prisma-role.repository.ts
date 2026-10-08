import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { StoredRole } from "../domain/role.js";
import type { GrantOutcome, RoleRepository } from "../application/ports.js";
import { ROLE_TO_DB } from "./prisma-account.repository.js";

/**
 * Rôles des comptes (S4-T06). Chaque écriture est UNE requête atomique (deux administrateurs simultanés
 * ne créent pas de doublon) et rejoint la transaction en cours : le rôle et sa ligne d'audit vont ensemble.
 */
@Injectable()
export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly tx: TransactionContext) {}

  grant(
    accountId: string,
    role: StoredRole,
    grantedBy: string | null,
    now: Date,
  ): Promise<GrantOutcome> {
    return this.tx.run(async () => {
      const db = this.tx.db;
      // Verrou partagé sur le compte jusqu'à la fin de la transaction : une désactivation ou une suppression
      // simultanée attend, et le statut lu ici est celui qui compte (relecture de sécurité S4-T06)
      const rows = await db.$queryRaw<{ status: string }[]>`
        SELECT "status"::text AS "status" FROM "identity"."accounts" WHERE "id" = ${accountId}::uuid FOR SHARE`;
      const status = rows[0]?.status;
      if (!status) return "missing";
      if (status !== "ACTIVE") return "inactive";
      const { count } = await db.accountRole.createMany({
        data: [{ accountId, role: ROLE_TO_DB[role], grantedBy, grantedAt: now }],
        skipDuplicates: true,
      });
      return count === 1 ? "granted" : "unchanged";
    });
  }

  async revoke(accountId: string, role: StoredRole): Promise<boolean> {
    const { count } = await this.tx.db.accountRole.deleteMany({
      where: { accountId, role: ROLE_TO_DB[role] },
    });
    return count === 1;
  }
}
