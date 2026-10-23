import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import {
  invitationStatus,
  issueInvitation,
  type BetaInvitation,
  type BetaInvitationKind,
  type BetaSettings,
} from "../domain/beta-invitation.js";
import { requireIdentifier, type Identifier } from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import { OtpService } from "./otp.service.js";
import {
  ACCOUNT_REPOSITORY,
  BETA_REPOSITORY,
  IDENTITY_CLOCK,
  IDENTITY_OPTIONS,
  TRANSACTION_RUNNER,
  type AccountRepository,
  type BetaInvitationCursor,
  type BetaRepository,
  type Clock,
  type IdentityOptions,
  type TransactionRunner,
} from "./ports.js";

const required = () =>
  new IdentityError(
    "INVITATION_REQUISE",
    "Kemdia est en bêta fermée : seules les adresses invitées peuvent créer un compte",
  );
const notFound = () => new IdentityError("INVITATION_INTROUVABLE", "invitation introuvable");

/**
 * Bêta fermée (S8-T02, ADR-0057). Quand l'administrateur ferme l'inscription, une adresse sans invitation valable ne
 * peut plus créer de compte ; les comptes existants ne voient aucune différence. L'invitation est liée à l'ADRESSE
 * (pas de code à recopier ni de lien secret à faire fuiter) et sert une seule fois.
 */
@Injectable()
export class BetaService {
  constructor(
    @Inject(BETA_REPOSITORY) private readonly beta: BetaRepository,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accounts: Pick<AccountRepository, "findByIdentifier">,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    @Inject(IDENTITY_OPTIONS) private readonly options: Pick<IdentityOptions, "siteUrl">,
    private readonly otp: OtpService,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
  ) {}

  now(): Date {
    return this.clock.now();
  }

  settings(): Promise<BetaSettings> {
    return this.beta.settings();
  }

  /** Ouvre ou ferme l'inscription (administrateur), journalisé. */
  setClosed(staffId: string, closed: boolean, context: AuditContext): Promise<BetaSettings> {
    return this.tx.run(async () => {
      const saved = await this.beta.saveSettings(closed, staffId, this.clock.now());
      await this.audit.record({
        action: "settings.beta_updated",
        actor: { type: "account", id: staffId },
        target: null,
        details: { state: closed ? "closed" : "open" },
        context,
      });
      return saved;
    });
  }

  /**
   * Invite une adresse (ou relance son invitation expirée ou annulée : 30 jours de plus). Refusé si elle a déjà un
   * compte. Un e-mail part quand c'est possible ; sinon (`notified: false`) l'équipe prévient la personne elle-même.
   */
  async invite(
    staffId: string,
    rawIdentifier: string,
    kind: BetaInvitationKind,
    context: AuditContext,
  ): Promise<{ invitation: BetaInvitation; notified: boolean }> {
    const identifier = requireIdentifier(rawIdentifier);
    if (await this.accounts.findByIdentifier(identifier)) throw alreadyRegistered();
    const invitation = await this.tx.run(async () => {
      const previous = await this.beta.findByIdentifier(identifier.value);
      if (previous?.usedAt) throw alreadyRegistered();
      const next = issueInvitation({
        id: previous?.id ?? randomUUID(),
        identifier: identifier.value,
        kind,
        invitedBy: staffId,
        now: this.clock.now(),
      });
      await this.beta.save(next);
      await this.audit.record({
        action: "beta.invited",
        actor: { type: "account", id: staffId },
        target: { type: "invitation", id: next.id },
        // Jamais l'adresse en clair dans le journal : le genre d'invitation et le canal suffisent
        details: { kind, channel: identifier.kind, renewed: previous ? 1 : 0 },
        context,
      });
      return next;
    });
    const link = this.options.siteUrl ? `${this.options.siteUrl}/inscription` : null;
    const notified = this.otp.notifyBetaInvitation(identifier, {
      expiresAt: invitation.expiresAt,
      link,
    });
    return { invitation, notified };
  }

  /** Annule une invitation pas encore utilisée (sans effet sur une invitation déjà annulée). */
  revoke(staffId: string, id: string, context: AuditContext): Promise<BetaInvitation> {
    return this.tx.run(async () => {
      const invitation = await this.beta.findById(id);
      if (!invitation) throw notFound();
      if (invitation.usedAt) throw used();
      if (invitation.revokedAt) return invitation;
      const now = this.clock.now();
      if (!(await this.beta.revoke(id, now))) throw used();
      await this.audit.record({
        action: "beta.invitation_revoked",
        actor: { type: "account", id: staffId },
        target: { type: "invitation", id },
        details: { kind: invitation.kind },
        context,
      });
      return { ...invitation, revokedAt: now };
    });
  }

  list(
    limit: number,
    after?: BetaInvitationCursor,
  ): Promise<{ items: BetaInvitation[]; next: BetaInvitationCursor | null }> {
    return this.beta.list(limit, after);
  }

  /**
   * Inscription fermée : l'adresse doit avoir une invitation VALABLE. Vérifié AVANT de regarder si l'adresse a déjà un
   * compte : la réponse ne dépend que de l'invitation, elle ne révèle donc pas les comptes existants (ADR-0016).
   */
  async assertMaySignUp(identifier: Identifier): Promise<void> {
    const { closed } = await this.beta.settings();
    if (!closed) return;
    const invitation = await this.beta.findByIdentifier(identifier.value);
    if (!invitation || invitationStatus(invitation, this.clock.now()) !== "active")
      throw required();
  }

  /** Compte créé : l'invitation de cette adresse (s'il y en a une valable) ne servira plus. */
  async afterSignup(identifier: Identifier, accountId: string): Promise<void> {
    await this.beta.markUsed(identifier.value, accountId, this.clock.now());
  }
}

function alreadyRegistered(): IdentityError {
  return new IdentityError("COMPTE_EXISTANT", "cette adresse a déjà un compte Kemdia");
}

function used(): IdentityError {
  return new IdentityError(
    "INVITATION_UTILISEE",
    "invitation déjà utilisée : le compte existe, elle ne s'annule plus",
  );
}
