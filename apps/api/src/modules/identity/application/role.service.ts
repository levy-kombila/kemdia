import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, NO_REQUEST, type AuditActor, type AuditContext } from "../../audit/index.js";
import type { Account, AdminAccountView } from "../domain/account.js";
import { requireIdentifier } from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import { assertCanChangeRole, type Role, type StoredRole } from "../domain/role.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  ROLE_REPOSITORY,
  TRANSACTION_RUNNER,
  type AccountRepository,
  type Clock,
  type RoleRepository,
  type TransactionRunner,
} from "./ports.js";

/** L'administrateur qui agit, tel que la session l'a authentifié (rôles relus à chaque requête). */
export interface RoleActor {
  accountId: string;
  roles: readonly Role[];
}

/** Résultat d'un changement par la commande serveur. */
export interface ServerRoleChange {
  accountId: string;
  /** `false` : le compte avait déjà (ou n'avait déjà plus) ce rôle ; rien n'a été écrit */
  changed: boolean;
}

const notFound = () => new IdentityError("COMPTE_INTROUVABLE", "aucun compte ne correspond");
const inactive = () =>
  new IdentityError(
    "COMPTE_INACTIF",
    "ce compte n'est pas actif (identifiant non vérifié ou compte fermé)",
  );

/**
 * Attribution des rôles (S4-T06, ADR-0020) — ferme CRIT-06 et MED-07 de l'audit Django.
 *
 * - Par l'API : un administrateur accorde ou retire `vendor` / `moderator` à un AUTRE compte.
 * - Par la commande serveur (`admin:grant`, `admin:revoke`) : le rôle `admin`, et lui seul.
 * - Chaque changement effectif est écrit au journal d'audit dans la même transaction ;
 *   un changement sans effet (rôle déjà présent) n'écrit rien.
 */
@Injectable()
export class RoleService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(ROLE_REPOSITORY) private readonly roles: RoleRepository,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
  ) {}

  /** Retrouve un compte par son e-mail ou son téléphone (administration). */
  async lookup(rawIdentifier: string): Promise<AdminAccountView> {
    const account = await this.accounts.findByIdentifier(requireIdentifier(rawIdentifier));
    if (!account) throw notFound();
    return account.adminView();
  }

  async grant(
    actor: RoleActor,
    targetId: string,
    role: string,
    context: AuditContext,
  ): Promise<AdminAccountView> {
    const change = { actorId: actor.accountId, actorRoles: actor.roles, targetId, role };
    assertCanChangeRole(change);
    // Contrôle anticipé (réponse claire) ; la règle qui fait foi est revérifiée sous verrou dans `apply`
    const target = await this.requireAccount(targetId);
    if (!target.isActive()) throw inactive();
    await this.apply(
      "grant",
      target.id,
      change.role,
      { type: "account", id: actor.accountId },
      "api",
      context,
    );
    return this.reload(target.id);
  }

  async revoke(
    actor: RoleActor,
    targetId: string,
    role: string,
    context: AuditContext,
  ): Promise<AdminAccountView> {
    const change = { actorId: actor.accountId, actorRoles: actor.roles, targetId, role };
    assertCanChangeRole(change);
    // Retirer reste possible sur un compte fermé (on ne laisse pas traîner un rôle)
    const target = await this.requireAccount(targetId);
    await this.apply(
      "revoke",
      target.id,
      change.role,
      { type: "account", id: actor.accountId },
      "api",
      context,
    );
    return this.reload(target.id);
  }

  /**
   * Commande serveur : accorde le rôle administrateur à un compte ACTIF (donc vérifié, BR-041).
   * C'est la seule façon de créer un administrateur : aucun secret, aucun compte par défaut.
   */
  async grantAdminFromServer(rawIdentifier: string): Promise<ServerRoleChange> {
    const account = await this.accounts.findByIdentifier(requireIdentifier(rawIdentifier));
    if (!account) throw notFound();
    if (!account.isActive()) throw inactive();
    const changed = await this.apply(
      "grant",
      account.id,
      "admin",
      { type: "system" },
      "server",
      NO_REQUEST,
    );
    return { accountId: account.id, changed };
  }

  /** Commande serveur : retire le rôle administrateur (compte compromis, départ). */
  async revokeAdminFromServer(rawIdentifier: string): Promise<ServerRoleChange> {
    const account = await this.accounts.findByIdentifier(requireIdentifier(rawIdentifier));
    if (!account) throw notFound();
    const changed = await this.apply(
      "revoke",
      account.id,
      "admin",
      { type: "system" },
      "server",
      NO_REQUEST,
    );
    return { accountId: account.id, changed };
  }

  private apply(
    kind: "grant" | "revoke",
    accountId: string,
    role: StoredRole,
    actor: AuditActor,
    source: "api" | "server",
    context: AuditContext,
  ): Promise<boolean> {
    return this.transactions.run(async () => {
      const grantedBy = actor.type === "account" ? actor.id : null;
      let changed: boolean;
      if (kind === "grant") {
        const outcome = await this.roles.grant(accountId, role, grantedBy, this.clock.now());
        if (outcome === "missing") throw notFound();
        if (outcome === "inactive") throw inactive();
        changed = outcome === "granted";
      } else {
        changed = await this.roles.revoke(accountId, role);
      }
      if (changed) {
        await this.audit.record({
          action: kind === "grant" ? "role.granted" : "role.revoked",
          actor,
          target: { type: "account", id: accountId },
          details: { role, source },
          context,
        });
      }
      return changed;
    });
  }

  private async requireAccount(id: string): Promise<Account> {
    const account = await this.accounts.findById(id);
    if (!account) throw notFound();
    return account;
  }

  private async reload(id: string): Promise<AdminAccountView> {
    return (await this.requireAccount(id)).adminView();
  }
}
