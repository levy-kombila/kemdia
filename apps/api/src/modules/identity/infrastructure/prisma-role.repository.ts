import { Injectable } from "@nestjs/common";
import { TransactionContext } from "../../../database/transaction-context.js";
import type { StoredRole } from "../domain/role.js";
import type { RoleRepository } from "../application/ports.js";
import { ROLE_TO_DB } from "./prisma-account.repository.js";

/**
 * Rôles des comptes (S4-T06). Chaque écriture est UNE requête atomique (deux administrateurs simultanés
 * ne créent pas de doublon) et rejoint la transaction en cours : le rôle et sa ligne d'audit vont ensemble.
 */
@Injectable()
export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly tx: TransactionContext) {}

  async grant(
    accountId: string,
    role: StoredRole,
    grantedBy: string | null,
    now: Date,
  ): Promise<boolean> {
    const { count } = await this.tx.db.accountRole.createMany({
      data: [{ accountId, role: ROLE_TO_DB[role], grantedBy, grantedAt: now }],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async revoke(accountId: string, role: StoredRole): Promise<boolean> {
    const { count } = await this.tx.db.accountRole.deleteMany({
      where: { accountId, role: ROLE_TO_DB[role] },
    });
    return count === 1;
  }
}
