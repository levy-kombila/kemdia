import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import type { AdminAccountView } from "../domain/account.js";
import { requireIdentifier } from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import { hasRole } from "../domain/role.js";
import type { RoleActor } from "./role.service.js";
import {
  ACCOUNT_REPOSITORY,
  STAFF_DIRECTORY,
  TRANSACTION_RUNNER,
  type AccountRepository,
  type StaffDirectory,
  type TransactionRunner,
} from "./ports.js";

/** Un compte vu par le service client. */
export interface SupportAccountView extends AdminAccountView {
  lastActiveAt: Date;
  emailVerified: boolean;
  phoneVerified: boolean;
}

/**
 * Service client (S7.5-T04, ADR-0051) : retrouver un compte par son e-mail ou son téléphone, en LECTURE SEULE. Chaque
 * consultation est inscrite au journal d'audit (données personnelles : qui a regardé quel compte, et quand).
 */
@Injectable()
export class SupportService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: Pick<AccountRepository, "findByIdentifier" | "findById">,
    @Inject(STAFF_DIRECTORY) private readonly staff: Pick<StaffDirectory, "activity">,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
  ) {}

  lookup(actor: RoleActor, rawIdentifier: string, context: AuditContext): Promise<SupportAccountView> {
    if (!hasRole(actor.roles, "support")) {
      throw new IdentityError("ACCES_REFUSE", "action réservée au service client");
    }
    const identifier = requireIdentifier(rawIdentifier);
    return this.transactions.run(async () => {
      const account = await this.accounts.findByIdentifier(identifier);
      const activity = account ? await this.staff.activity(account.id) : null;
      if (!account || !activity) {
        throw new IdentityError("COMPTE_INTROUVABLE", "aucun compte ne correspond");
      }
      await this.audit.record({
        action: "support.account_viewed",
        actor: { type: "account", id: actor.accountId },
        target: { type: "account", id: account.id },
        details: {},
        context,
      });
      return { ...account.adminView(), ...activity };
    });
  }

  /** Le compte existe-t-il (avant de lire ses commandes) ? */
  async exists(actor: RoleActor, accountId: string): Promise<boolean> {
    if (!hasRole(actor.roles, "support")) {
      throw new IdentityError("ACCES_REFUSE", "action réservée au service client");
    }
    return (await this.accounts.findById(accountId)) !== null;
  }
}
