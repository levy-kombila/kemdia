import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service.js";
import type {
  Account as AccountRow,
  AccountRole as AccountRoleRow,
} from "../../../generated/prisma/client.js";
import { Account, type AccountStatus } from "../domain/account.js";
import type { Identifier } from "../domain/identifier.js";
import type { StoredRole } from "../domain/role.js";
import { IdentifierTakenError, type AccountRepository } from "../application/ports.js";
import { isUniqueViolation } from "./prisma-errors.js";

const TO_DB = { pending: "PENDING", active: "ACTIVE", disabled: "DISABLED" } as const;
const FROM_DB = {
  PENDING: "pending",
  ACTIVE: "active",
  DISABLED: "disabled",
} as const satisfies Record<AccountRow["status"], AccountStatus>;

export const ROLE_TO_DB = {
  vendor: "VENDOR",
  catalog: "CATALOG",
  logistics: "LOGISTICS",
  finance: "FINANCE",
  support: "SUPPORT",
  admin: "ADMIN",
} as const satisfies Record<StoredRole, AccountRoleRow["role"]>;
const ROLE_FROM_DB = {
  VENDOR: "vendor",
  CATALOG: "catalog",
  LOGISTICS: "logistics",
  FINANCE: "finance",
  SUPPORT: "support",
  ADMIN: "admin",
} as const satisfies Record<AccountRoleRow["role"], StoredRole>;

/** Les rôles sont lus avec le compte, à chaque requête : un rôle retiré ne sert plus, tout de suite. */
export const WITH_ROLES = { roles: { select: { role: true } } } as const;

export function toDomain(row: AccountRow & { roles: Pick<AccountRoleRow, "role">[] }): Account {
  return Account.restore({
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    passwordHash: row.passwordHash,
    passwordVersion: row.passwordVersion,
    status: FROM_DB[row.status],
    emailVerifiedAt: row.emailVerifiedAt,
    phoneVerifiedAt: row.phoneVerifiedAt,
    roles: row.roles.map((r) => ROLE_FROM_DB[r.role]),
    createdAt: row.createdAt,
  });
}

/**
 * Colonnes modifiables (ni l'identifiant ni la date de création).
 * La version du mot de passe n'est JAMAIS écrite ici : seul applyReset la change, par une mise à jour ciblée.
 */
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
  };
}

@Injectable()
export class PrismaAccountRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Account | null> {
    const row = await this.prisma.account.findUnique({ where: { id }, include: WITH_ROLES });
    return row ? toDomain(row) : null;
  }

  async findByIdentifier(identifier: Identifier): Promise<Account | null> {
    const row = await this.prisma.account.findUnique({
      where:
        identifier.kind === "email" ? { email: identifier.value } : { phone: identifier.value },
      include: WITH_ROLES,
    });
    return row ? toDomain(row) : null;
  }

  async save(account: Account): Promise<void> {
    const { id, createdAt } = account.snapshot();
    const data = writable(account);
    try {
      await this.prisma.account.upsert({
        where: { id },
        // Preuve du consentement (S7-T08, art. 72 et 74) : un compte n'est CRÉÉ que par l'inscription, dont le contrat
        // exige les deux cases (conditions acceptées, 18 ans ou plus) ; leur date est celle de la création
        create: { id, createdAt, termsAcceptedAt: createdAt, adultConfirmedAt: createdAt, ...data },
        update: data,
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new IdentifierTakenError();
      throw error;
    }
  }
}
