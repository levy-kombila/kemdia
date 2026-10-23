import { randomBytes, randomUUID } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";
import { Account, assertValidNames } from "../domain/account.js";
import { parseIdentifier, requireIdentifier } from "../domain/identifier.js";
import { IdentityError } from "../domain/identity-error.js";
import { assertStrongPassword, normalizeName } from "../domain/password-policy.js";
import {
  SIGNUP_TICKET_PATTERN,
  SIGNUP_TICKET_TTL_MS,
  hashSignupTicket,
  type SignupTicket,
} from "../domain/signup-ticket.js";
import { BetaService } from "./beta.service.js";
import { OtpService, type IssuedOtp } from "./otp.service.js";
import { DeviceService } from "./device.service.js";
import { SessionService, type OpenedSession } from "./session.service.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  IdentifierTakenError,
  PASSWORD_HASHER,
  SIGNUP_TICKET_REPOSITORY,
  type AccountRepository,
  type Clock,
  type PasswordHasher,
  type SignupTicketRepository,
} from "./ports.js";

export interface SignupInput {
  firstName: string;
  lastName: string;
  identifier: string;
  password: string;
}

export interface SignupStarted extends Omit<IssuedOtp, "challengeId"> {
  /** Secret à présenter pour vérifier le code ou en redemander un (gardé par le site dans un cookie HttpOnly). */
  ticket: string;
}

const expiredTicket = () =>
  new IdentityError("CODE_EXPIRE", "inscription expirée ou remplacée : recommencez l'inscription");

/**
 * Inscription (FR-001) et vérification de l'identifiant par un code (BR-041, HIGH-11) — ADR-0016.
 *
 * - L'inscription n'écrit AUCUN compte : elle crée un ticket qui porte prénom, nom et hachage du mot de passe,
 *   et envoie un code. Le compte est créé, déjà vérifié, quand le bon code revient avec ce ticket.
 * - Une seule inscription en cours par adresse : une nouvelle remplace la précédente (l'ancien ticket ne vaut plus rien).
 * - Adresse déjà inscrite : même réponse, ticket « leurre » sans inscription, ALERTE au titulaire au lieu d'un code.
 * - Le mot de passe est haché dans tous les cas, et les deux chemins font les mêmes écritures : la durée ne trahit rien.
 */
@Injectable()
export class SignupService {
  constructor(
    @Inject(ACCOUNT_REPOSITORY) private readonly accounts: AccountRepository,
    @Inject(SIGNUP_TICKET_REPOSITORY) private readonly tickets: SignupTicketRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    // Obligatoire : un câblage oublié ne doit jamais rouvrir l'inscription en silence (relecture S8-T02)
    @Inject(BetaService)
    private readonly beta: Pick<BetaService, "assertMaySignUp" | "afterSignup">,
    @Optional()
    @Inject(DeviceService)
    private readonly devices?: Pick<DeviceService, "afterSignup">,
  ) {}

  async start(input: SignupInput): Promise<SignupStarted> {
    // 1. Contrôles qui ne dépendent pas de la base : même réponse pour tout le monde
    const identifier = requireIdentifier(input.identifier);
    assertValidNames(input.firstName, input.lastName);
    assertStrongPassword(input.password);
    this.otp.assertChannelAvailable(identifier);
    // Bêta fermée (S8-T02) : invitation valable exigée, AVANT de regarder si l'adresse a un compte (pas d'énumération)
    await this.beta.assertMaySignUp(identifier);

    const passwordHash = await this.hasher.hash(input.password);
    const exists = (await this.accounts.findByIdentifier(identifier)) !== null;

    // 2. Code (ou alerte) : les limites d'envoi sont vérifiées ici ; refus → rien n'est écrit
    const issued = await this.otp.issue("signup", identifier, exists ? "signup-alert" : "code");

    // 3. Ticket (remplace toute inscription en cours pour cette adresse)
    const ticket = await this.createTicket(
      identifier.value,
      exists
        ? null
        : {
            firstName: normalizeName(input.firstName) ?? "",
            lastName: normalizeName(input.lastName) ?? "",
            passwordHash,
          },
    );
    return {
      ticket,
      channel: issued.channel,
      sentTo: issued.sentTo,
      resendInSeconds: issued.resendInSeconds,
    };
  }

  /** Nouveau code pour une inscription en cours (mêmes limites ; rien n'est envoyé pour un ticket leurre). */
  async resend(ticket: string): Promise<SignupStarted> {
    const found = await this.findTicket(ticket);
    const identifier = requireIdentifier(found.destination);
    const issued = await this.otp.issue("signup", identifier, found.registration ? "code" : "none");
    return {
      ticket,
      channel: issued.channel,
      sentTo: issued.sentTo,
      resendInSeconds: issued.resendInSeconds,
    };
  }

  /**
   * BR-041 : le bon code crée le compte, déjà vérifié, avec les données du ticket,
   * et ouvre directement une session (choix du 2026-10-08 : pas besoin de retaper le mot de passe).
   */
  async verify(
    ticket: string,
    code: string,
    userAgent?: string,
    device?: string,
  ): Promise<OpenedSession> {
    const found = await this.findTicket(ticket);
    const identifier = requireIdentifier(found.destination);
    await this.otp.verify("signup", identifier, code);

    // Ticket leurre : même un code deviné par chance ne valide rien
    if (!found.registration) throw new IdentityError("CODE_INVALIDE", "code incorrect");

    // L'invitation a pu être annulée (ou l'inscription fermée) depuis le début de l'inscription
    await this.beta.assertMaySignUp(identifier);
    const now = this.clock.now();
    const account = Account.register({ id: randomUUID(), identifier, now, ...found.registration });
    account.markVerified(identifier, now);
    try {
      await this.accounts.save(account);
    } catch (error) {
      // Un compte a été créé entre-temps pour cette adresse : cette inscription ne vaut plus
      if (error instanceof IdentifierTakenError) throw expiredTicket();
      throw error;
    }
    await this.tickets.deleteForDestination(found.destination);
    await this.beta.afterSignup(identifier, account.id);
    const opened = await this.sessions.open(account, userAgent);
    // L'appareil qui vient de créer le compte est retenu sans avis (S7.5-T04) : le suivant en recevra un
    await this.devices?.afterSignup(account, device, userAgent);
    return opened;
  }

  private async createTicket(
    destination: string,
    registration: SignupTicket["registration"],
  ): Promise<string> {
    const now = this.clock.now();
    const ticket = randomBytes(32).toString("base64url");
    await this.tickets.replaceForDestination({
      id: randomUUID(),
      ticketHash: hashSignupTicket(ticket),
      destination,
      registration,
      expiresAt: new Date(now.getTime() + SIGNUP_TICKET_TTL_MS),
      createdAt: now,
    });
    return ticket;
  }

  private async findTicket(ticket: string): Promise<SignupTicket> {
    if (!SIGNUP_TICKET_PATTERN.test(ticket)) throw expiredTicket();
    const found = await this.tickets.findByHash(hashSignupTicket(ticket));
    if (!found || found.expiresAt <= this.clock.now() || !parseIdentifier(found.destination)) {
      throw expiredTicket();
    }
    return found;
  }
}
