import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, NO_REQUEST, type AuditContext } from "../../audit/index.js";
import { parseIdentifier, requireIdentifier } from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import type { Account } from "../domain/account.js";
import { assertStrongPassword } from "../domain/password-policy.js";
import {
  RESET_TICKET_PATTERN,
  RESET_TICKET_TTL_MS,
  hashResetTicket,
  type ResetTicket,
} from "../domain/reset-ticket.js";
import { generateSecret } from "../domain/secret.js";
import { OtpService, type IssuedOtp } from "./otp.service.js";
import { SessionService, type OpenedSession } from "./session.service.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  PASSWORD_HASHER,
  RESET_TICKET_REPOSITORY,
  TRANSACTION_RUNNER,
  type AccountRepository,
  type Clock,
  type PasswordHasher,
  type ResetTicketRepository,
  type TransactionRunner,
} from "./ports.js";

export interface ResetStarted extends Omit<IssuedOtp, "challengeId"> {
  /** Secret à présenter avec le code (gardé par le site dans un cookie HttpOnly). */
  ticket: string;
}

export interface ResetInput {
  ticket: string;
  code: string;
  newPassword: string;
  userAgent?: string;
  /** Pour le journal d'audit (S4-T06) */
  context?: AuditContext;
}

const invalidCode = () => new IdentityError("CODE_INVALIDE", "code incorrect");

function guardIdentifiers(account: Account): string[] {
  const { email, phone } = account.snapshot();
  return [email, phone].filter((v): v is string => v !== null);
}

const expiredTicket = () =>
  new IdentityError(
    "CODE_EXPIRE",
    "demande expirée ou remplacée : recommencez « mot de passe oublié »",
  );

/**
 * Mot de passe oublié (FR-012) — ADR-0018.
 *
 * - Adresse sans compte : même réponse, mêmes limites, AUCUN e-mail (choix du 2026-10-08), ticket leurre.
 * - Le bon code avec le ticket : nouveau mot de passe, blocage BR-040 levé, toutes les autres sessions fermées,
 *   client connecté sur cet appareil (choix du 2026-10-08), avis « mot de passe modifié » envoyé.
 */
@Injectable()
export class PasswordResetService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(RESET_TICKET_REPOSITORY) private readonly tickets: ResetTicketRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
  ) {}

  async start(rawIdentifier: string): Promise<ResetStarted> {
    const identifier = requireIdentifier(rawIdentifier);
    this.otp.assertChannelAvailable(identifier);
    const account = await this.accounts.findByIdentifier(identifier);
    const accountId = account?.isActive() ? account.id : null;

    // Limites d'envoi vérifiées ici, pour tout le monde ; rien n'est écrit si elles refusent
    const issued = await this.otp.issue("reset", identifier, accountId ? "code" : "none");
    const ticket = await this.createTicket(identifier.value, accountId);
    return {
      ticket,
      channel: issued.channel,
      sentTo: issued.sentTo,
      resendInSeconds: issued.resendInSeconds,
    };
  }

  async resend(ticket: string): Promise<ResetStarted> {
    const found = await this.findTicket(ticket);
    const identifier = requireIdentifier(found.destination);
    const issued = await this.otp.issue("reset", identifier, found.accountId ? "code" : "none");
    return {
      ticket,
      channel: issued.channel,
      sentTo: issued.sentTo,
      resendInSeconds: issued.resendInSeconds,
    };
  }

  async reset(input: ResetInput): Promise<OpenedSession> {
    const found = await this.findTicket(input.ticket);
    // Mot de passe vérifié AVANT le code : un mot de passe trop faible ne fait pas perdre un essai
    assertStrongPassword(input.newPassword);
    const identifier = requireIdentifier(found.destination);
    await this.otp.verify("reset", identifier, input.code);

    // Ticket leurre : même un code deviné ne change rien. L'adresse doit encore appartenir au compte.
    const account = found.accountId ? await this.accounts.findById(found.accountId) : null;
    if (!account || !account.isActive() || !account.owns(identifier)) throw invalidCode();

    const expectedVersion = account.passwordVersion;
    account.changePassword(await this.hasher.hash(input.newPassword));
    // UNE transaction : mot de passe (version +1), tickets supprimés, toutes les sessions fermées,
    // blocage BR-040 levé, ligne du journal d'audit (S4-T06). Les sessions ouvertes avec l'ancienne version
    // sont refusées ensuite.
    const applied = await this.transactions.run(async () => {
      const done = await this.tickets.applyReset({
        accountId: account.id,
        expectedVersion,
        passwordHash: account.passwordHash,
        destination: found.destination,
        guardIdentifiers: guardIdentifiers(account),
        now: this.clock.now(),
      });
      if (done) {
        await this.audit.record({
          action: "password.reset",
          actor: { type: "account", id: account.id },
          target: { type: "account", id: account.id },
          details: {},
          context: input.context ?? NO_REQUEST,
        });
      }
      return done;
    });
    if (!applied) throw invalidCode();

    this.otp.notifyPasswordChanged(identifier);
    return this.sessions.open(account, input.userAgent);
  }

  private async createTicket(destination: string, accountId: string | null): Promise<string> {
    const now = this.clock.now();
    const ticket = generateSecret();
    const record: ResetTicket = {
      id: randomUUID(),
      ticketHash: hashResetTicket(ticket),
      destination,
      accountId,
      expiresAt: new Date(now.getTime() + RESET_TICKET_TTL_MS),
      createdAt: now,
    };
    await this.tickets.replaceForDestination(record);
    return ticket;
  }

  private async findTicket(ticket: string): Promise<ResetTicket> {
    if (!RESET_TICKET_PATTERN.test(ticket)) throw expiredTicket();
    const found = await this.tickets.findByHash(hashResetTicket(ticket));
    if (!found || found.expiresAt <= this.clock.now() || !parseIdentifier(found.destination)) {
      throw expiredTicket();
    }
    return found;
  }
}
