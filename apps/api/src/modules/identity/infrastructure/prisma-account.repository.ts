import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import type { Account as AccountRow } from "../../../generated/prisma/client.js";
import { Account, type AccountStatus } from "../domain/account.js";
import type { Identifier } from "../domain/identifier.js";
import { IdentifierTakenError, type AccountRepository } from "../application/ports.js";
import { isUniqueViolation } from "./prisma-errors.js";

const TO_DB = { pending: "PENDING", active: "ACTIVE", disabled: "DISABLED" } as const;
const FROM_DB = {
  PENDING: "pending",
  ACTIVE: "active",
  DISABLED: "disabled",
} as const satisfies Record<AccountRow["status"], AccountStatus>;

function toDomain(row: AccountRow): Account {
  return Account.restore({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    passwordHash: row.passwordHash,
    status: FROM_DB[row.status],
    emailVerifiedAt: row.emailVerifiedAt,
    phoneVerifiedAt: row.phoneVerifiedAt,
    failedLogins: row.failedLogins,
    lockedUntil: row.lockedUntil,
    createdAt: row.createdAt,
  });
}

/** Colonnes modifiables (ni l'identifiant ni la date de création). */
function writable(account: Account) {
  const s = account.snapshot();
  return {
    firstName: s.firstName,
    lastName: s.lastName,
    email: s.email,
    phone: s.phone,
    passwordHash: s.passwordHash,
    status: TO_DB[s.status],
    emailVerifiedAt: s.emailVerifiedAt,
    phoneVerifiedAt: s.phoneVerifiedAt,
    failedLogins: s.failedLogins,
    lockedUntil: s.lockedUntil,
  };
}

@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Account | null> {
    const row = await this.prisma.account.findUnique({ where: { id } });
    return row ? toDomain(row) : null;
  }

  async findByIdentifier(identifier: Identifier): Promise<Account | null> {
    const row = await this.prisma.account.findUnique({
      where:
        identifier.kind === "email" ? { email: identifier.value } : { phone: identifier.value },
    });
    return row ? toDomain(row) : null;
  }

  async save(account: Account): Promise<void> {
    const { id, createdAt } = account.snapshot();
    const data = writable(account);
    try {
      await this.prisma.account.upsert({
        where: { id },
        create: { id, createdAt, ...data },
        update: data,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new IdentifierTakenError();
      throw error;
    }
  }
}
