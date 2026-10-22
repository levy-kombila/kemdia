import { Inject, Injectable } from "@nestjs/common";
import { STAFF_LIMITS, STAFF_ROLES } from "@kemdia/contracts/constants";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import type { Account, AdminAccountView } from "../domain/account.js";
import { IdentityError } from "../domain/identity-error.js";
import { hasRole, type StaffRole, type StoredRole } from "../domain/role.js";
import type { RoleActor } from "./role.service.js";
import {
  IDENTITY_CLOCK,
  ROLE_REPOSITORY,
  SESSION_REPOSITORY,
  STAFF_DIRECTORY,
  TRANSACTION_RUNNER,
  type Clock,
  type RoleRepository,
  type SessionRepository,
  type StaffCursor,
  type StaffDirectory,
  type StaffRecord,
  type TransactionRunner,
} from "./ports.js";

/** Résultat d'une action sur un compte : le compte après coup, et les sessions fermées. */
export interface StaffActionResult {
  account: AdminAccountView;
  sessionsClosed: number;
}

const notFound = () => new IdentityError("COMPTE_INTROUVABLE", "aucun compte ne correspond");
const notAdmin = () => new IdentityError("ACCES_REFUSE", "action réservée à l'administration");
const protectedAdmin = () =>
  new IdentityError(
    "COMPTE_PROTEGE",
    "un administrateur se retire seulement depuis le serveur (commande admin:revoke)",
  );

/** Rôles de l'équipe qu'un administrateur retire depuis l'écran (jamais « admin »). */
const REMOVABLE: readonly StoredRole[] = STAFF_ROLES.filter(
  (role): role is Exclude<StaffRole, "admin"> => role !== "admin",
);

/**
 * Écran Utilisateurs de l'administration (S7.5-T04, ADR-0051) : liste de l'équipe, départ d'un employé (rôles retirés,
 * sessions fermées), désactivation et réactivation d'un compte. Chaque action verrouille le compte, revérifie les
 * règles et s'écrit au journal d'audit dans la même transaction.
 *
 * Règles : réservé aux administrateurs (revérifié ici en plus de la route) ; jamais sur son propre compte ; jamais sur
 * un administrateur (commande serveur seulement, comme sa nomination) ; un compte effacé ne revient jamais.
 */
@Injectable()
export class StaffAccountService {
  constructor(
    @Inject(STAFF_DIRECTORY) private readonly staff: StaffDirectory,
    @Inject(ROLE_REPOSITORY) private readonly roles: Pick<RoleRepository, "revoke">,
    @Inject(SESSION_REPOSITORY)
    private readonly sessions: Pick<SessionRepository, "revokeAllForAccount">,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
  ) {}

  list(
    actor: RoleActor,
    query: { role?: StaffRole | undefined; limit: number; after?: StaffCursor | undefined },
  ): Promise<{ items: StaffRecord[]; next: StaffCursor | null }> {
    if (!hasRole(actor.roles, "admin")) throw notAdmin();
    return this.staff.list({
      roles: query.role ? [query.role] : STAFF_ROLES,
      limit: query.limit,
      after: query.after,
    });
  }

  /** Départ d'un employé : tous ses rôles de l'équipe retirés, toutes ses sessions fermées. Il redevient client. */
  removeStaff(actor: RoleActor, targetId: string, context: AuditContext): Promise<StaffActionResult> {
    return this.onAccount(actor, targetId, async (account) => {
      const held = REMOVABLE.filter((role) => account.roles.includes(role));
      for (const role of held) await this.roles.revoke(account.id, role);
      const sessionsClosed = await this.sessions.revokeAllForAccount(account.id, this.clock.now());
      await this.audit.record({
        action: "staff.removed",
        actor: { type: "account", id: actor.accountId },
        target: { type: "account", id: account.id },
        details: { roles: held.join(",") || "aucun", sessions: sessionsClosed },
        context,
      });
      return sessionsClosed;
    });
  }

  /** Désactivation : plus aucune connexion (même comme client), sessions fermées tout de suite ; motif au journal. */
  disable(
    actor: RoleActor,
    targetId: string,
    reason: string,
    context: AuditContext,
  ): Promise<StaffActionResult> {
    const text = reason.replace(/\s+/g, " ").trim();
    const length = [...text].length;
    if (length < STAFF_LIMITS.reasonMin || length > STAFF_LIMITS.reasonMax) {
      throw new IdentityError(
        "MOTIF_INVALIDE",
        `le motif : ${STAFF_LIMITS.reasonMin} à ${STAFF_LIMITS.reasonMax} caractères`,
      );
    }
    return this.onAccount(actor, targetId, async (account) => {
      if (!account.isActive()) {
        throw new IdentityError("COMPTE_INACTIF", "ce compte n'est pas actif");
      }
      const now = this.clock.now();
      await this.staff.setStatus(account.id, "disabled", now);
      const sessionsClosed = await this.sessions.revokeAllForAccount(account.id, now);
      await this.audit.record({
        action: "account.disabled",
        actor: { type: "account", id: actor.accountId },
        target: { type: "account", id: account.id },
        // Le journal limite chaque détail à 100 caractères : le début du motif suffit à l'enquête
        details: { reason: [...text].slice(0, 100).join(""), sessions: sessionsClosed },
        context,
      });
      return sessionsClosed;
    });
  }

  /** Réactivation d'un compte désactivé (jamais d'un compte effacé). Ses rôles éventuels n'ont pas bougé. */
  enable(actor: RoleActor, targetId: string, context: AuditContext): Promise<StaffActionResult> {
    return this.onAccount(
      actor,
      targetId,
      async (account) => {
        if (account.status !== "disabled") {
          throw new IdentityError("COMPTE_INACTIF", "ce compte n'est pas désactivé");
        }
        await this.staff.setStatus(account.id, "active", this.clock.now());
        await this.audit.record({
          action: "account.enabled",
          actor: { type: "account", id: actor.accountId },
          target: { type: "account", id: account.id },
          details: {},
          context,
        });
        return 0;
      },
    );
  }

  /** Règles communes, sous le verrou du compte, puis l'action ; renvoie le compte relu. */
  private onAccount(
    actor: RoleActor,
    targetId: string,
    act: (account: Account) => Promise<number>,
  ): Promise<StaffActionResult> {
    if (!hasRole(actor.roles, "admin")) throw notAdmin();
    const id = targetId.toLowerCase();
    if (actor.accountId.toLowerCase() === id) {
      throw new IdentityError(
        "ROLE_SUR_SOI_INTERDIT",
        "vous ne pouvez pas faire cette action sur votre propre compte",
      );
    }
    return this.transactions.run(async () => {
      const locked = await this.staff.lock(id);
      if (!locked || locked.deleted) throw notFound();
      if (locked.account.roles.includes("admin")) throw protectedAdmin();
      const sessionsClosed = await act(locked.account);
      const after = await this.staff.lock(id);
      if (!after) throw notFound();
      return { account: after.account.adminView(), sessionsClosed };
    });
  }
}
