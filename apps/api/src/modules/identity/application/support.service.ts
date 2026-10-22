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
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accounts: Pick<AccountRepository, "findByIdentifier" | "findById">,
    @Inject(STAFF_DIRECTORY) private readonly staff: Pick<StaffDirectory, "activity">,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
  ) {}

  lookup(
    actor: RoleActor,
    rawIdentifier: string,
    context: AuditContext,
  ): Promise<SupportAccountView> {
    if (!hasRole(actor.roles, "support")) {
      throw new IdentityError("ACCES_REFUSE", "action réservée au service client");
    }
    const identifier = requireIdentifier(rawIdentifier);
    return this.transactions
      .run(async () => {
        const account = await this.accounts.findByIdentifier(identifier);
        const activity = account ? await this.staff.activity(account.id) : null;
        if (!account || !activity) {
          // Recherche sans résultat tracée aussi (sans l'identifiant) : sonder qui a un compte laisse une trace
          await this.audit.record({
            action: "support.lookup_failed",
            actor: { type: "account", id: actor.accountId },
            target: null,
            details: {},
            context,
          });
          return null;
        }
        await this.audit.record({
          action: "support.account_viewed",
          actor: { type: "account", id: actor.accountId },
          target: { type: "account", id: account.id },
          details: {},
          context,
        });
        return { ...account.adminView(), ...activity };
      })
      .then((found) => {
        // Levée APRÈS la transaction : la ligne du journal est gardée
        if (!found) throw new IdentityError("COMPTE_INTROUVABLE", "aucun compte ne correspond");
        return found;
      });
  }

  /**
   * Avant de lire les commandes d'un client : le compte doit exister (sinon `COMPTE_INTROUVABLE`), et chaque lecture
   * est inscrite au journal (`support.orders_viewed`, avec la référence pour une commande).
   */
  async recordOrdersView(
    actor: RoleActor,
    accountId: string,
    reference: string | null,
    context: AuditContext,
  ): Promise<void> {
    if (!hasRole(actor.roles, "support")) {
      throw new IdentityError("ACCES_REFUSE", "action réservée au service client");
    }
    if ((await this.accounts.findById(accountId)) === null) {
      throw new IdentityError("COMPTE_INTROUVABLE", "aucun compte ne correspond");
    }
    await this.audit.record({
      action: "support.orders_viewed",
      actor: { type: "account", id: actor.accountId },
      target: { type: "account", id: accountId },
      details: reference ? { reference } : {},
      context,
    });
  }
}
