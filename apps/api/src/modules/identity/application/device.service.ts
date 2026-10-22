import { randomUUID } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import {
  DEVICE_ALERT_DAYS,
  DEVICE_ALERTS_MAX,
  KNOWN_DEVICES_MAX,
} from "@kemdia/contracts/constants";
import { AuditLog, NO_REQUEST, type AuditContext } from "../../audit/index.js";
import type { Account } from "../domain/account.js";
import { describeDevice, hashAlertToken, hashDeviceId } from "../domain/device.js";
import { IdentityError } from "../domain/identity-error.js";
import { SECRET_PATTERN, generateSecret } from "../domain/secret.js";
import { summarizeUserAgent } from "../domain/session.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  PASSWORD_HASHER,
  IDENTITY_OPTIONS,
  KNOWN_DEVICE_REPOSITORY,
  SESSION_REPOSITORY,
  TRANSACTION_RUNNER,
  type AccountRepository,
  type Clock,
  type IdentityOptions,
  type PasswordHasher,
  type KnownDeviceRepository,
  type SessionRepository,
  type TransactionRunner,
} from "./ports.js";
import { OtpService } from "./otp.service.js";

const DAY_MS = 24 * 60 * 60_000;
const NO_CONTEXT = NO_REQUEST;
const invalidAlert = () =>
  new IdentityError(
    "ALERTE_INVALIDE",
    "ce lien n'est plus valable (déjà utilisé ou plus de 7 jours) : utilisez « Mot de passe oublié »",
  );

/**
 * Avis « connexion depuis un nouvel appareil » (S7.5-T04, ADR-0051), comme Amazon ou Jumia. À chaque connexion par mot
 * de passe, l'appareil (identifiant aléatoire du cookie du site) est reconnu ou retenu ; s'il est inconnu, le
 * titulaire reçoit un avis, avec un lien « ce n'est pas moi » qui ferme toutes les sessions du compte.
 */
@Injectable()
export class DeviceService {
  private readonly logger = new Logger("Appareils");

  constructor(
    @Inject(KNOWN_DEVICE_REPOSITORY) private readonly devices: KnownDeviceRepository,
    @Inject(SESSION_REPOSITORY)
    private readonly sessions: Pick<SessionRepository, "revokeAllForAccount">,
    @Inject(IDENTITY_CLOCK) private readonly clock: Clock,
    @Inject(IDENTITY_OPTIONS) private readonly options: IdentityOptions,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(TRANSACTION_RUNNER) private readonly transactions: TransactionRunner,
    @Inject(OtpService) private readonly notices: Pick<OtpService, "notifyNewDevice">,
    @Inject(ACCOUNT_REPOSITORY)
    private readonly accounts: Pick<AccountRepository, "findById" | "save">,
    @Inject(PASSWORD_HASHER) private readonly hasher: Pick<PasswordHasher, "hash">,
  ) {}

  /**
   * Connexion réussie : appareil reconnu, ou retenu avec un avis au titulaire. Jamais bloquant : une panne ici ne doit
   * pas empêcher le titulaire de se connecter (elle est journalisée).
   *
   * Relecture de sécurité : une connexion SANS identifiant d'appareil (appel direct à l'API) compte comme un appareil
   * inconnu, et le premier appareil d'un compte n'est plus dispensé d'avis (choix du 2026-10-22) ; seule la connexion
   * qui suit l'inscription l'est (`afterSignup`).
   */
  async afterLogin(
    account: Account,
    device: string | undefined,
    userAgent: string | undefined,
    context: AuditContext,
  ): Promise<void> {
    const id = device && SECRET_PATTERN.test(device) ? device : generateSecret();
    await this.sight(account, id, userAgent, context, false);
  }

  /** Session ouverte par l'inscription : l'appareil qui vient de créer le compte est retenu, sans avis. */
  async afterSignup(
    account: Account,
    device: string | undefined,
    userAgent: string | undefined,
  ): Promise<void> {
    if (!device || !SECRET_PATTERN.test(device)) return;
    await this.sight(account, device, userAgent, NO_CONTEXT, true);
  }

  private async sight(
    account: Account,
    device: string,
    userAgent: string | undefined,
    context: AuditContext,
    silent: boolean,
  ): Promise<void> {
    try {
      const now = this.clock.now();
      const token = generateSecret();
      const outcome = await this.transactions.run(async () => {
        const seen = await this.devices.sight({
          id: randomUUID(),
          accountId: account.id,
          deviceHash: hashDeviceId(device),
          userAgent: summarizeUserAgent(userAgent),
          alertTokenHash: hashAlertToken(token),
          alertExpiresAt: new Date(now.getTime() + DEVICE_ALERT_DAYS * DAY_MS),
          now,
          max: KNOWN_DEVICES_MAX,
          maxAlerts: DEVICE_ALERTS_MAX,
          silent,
        });
        if (seen === "alerted" || seen === "throttled") {
          await this.audit.record({
            action: "device.new_login",
            actor: { type: "account", id: account.id },
            target: { type: "account", id: account.id },
            details: {
              device: describeDevice(userAgent),
              ...(seen === "throttled" ? { notice: "non" } : {}),
            },
            context,
          });
        }
        return seen;
      });
      if (outcome !== "alerted") return;
      const contact = this.contactOf(account);
      if (!contact) return;
      const site = this.options.siteUrl ?? null;
      this.notices.notifyNewDevice(contact, {
        device: describeDevice(userAgent),
        at: now,
        // Jeton dans l'adresse de la page, qui ne fait rien seule : il faut cliquer « Déconnecter tout »
        link: site ? `${site}/securite/pas-moi?jeton=${token}` : null,
      });
    } catch (error) {
      this.logger.warn(
        `appareil non enregistré : ${error instanceof Error ? error.name : "erreur inconnue"}`,
      );
    }
  }

  /**
   * « Ce n'est pas moi » : le jeton (usage unique, 7 jours) ferme toutes les sessions du compte, bloque le mot de passe
   * et oublie l'appareil.
   * Aucune session n'est demandée : le titulaire n'a peut-être plus accès à son compte.
   */
  async notMe(token: string, context: AuditContext): Promise<{ sessionsClosed: number }> {
    if (!SECRET_PATTERN.test(token)) throw invalidAlert();
    // Mot de passe bloqué (choix du 2026-10-22) : remplacé par l'empreinte d'un secret aléatoire jeté aussitôt. Le
    // voleur ne peut plus revenir ; le titulaire choisit un nouveau mot de passe par « Mot de passe oublié ».
    const blocked = await this.hasher.hash(generateSecret());
    return this.transactions.run(async () => {
      const now = this.clock.now();
      const found = await this.devices.consumeAlert(hashAlertToken(token), now);
      if (!found) throw invalidAlert();
      const account = await this.accounts.findById(found.accountId);
      if (account) {
        account.changePassword(blocked);
        await this.accounts.save(account);
      }
      const sessionsClosed = await this.sessions.revokeAllForAccount(found.accountId, now);
      await this.audit.record({
        action: "device.not_me",
        actor: { type: "account", id: found.accountId },
        target: { type: "account", id: found.accountId },
        details: { sessions: sessionsClosed, password: "bloqué" },
        context,
      });
      return { sessionsClosed };
    });
  }

  /** E-mail vérifié de préférence, sinon mobile vérifié ; jamais un identifiant non prouvé. */
  private contactOf(account: Account): string | null {
    const s = account.snapshot();
    if (s.email && s.emailVerifiedAt) return s.email;
    if (s.phone && s.phoneVerifiedAt) return s.phone;
    return null;
  }
}
