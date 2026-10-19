import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, NO_REQUEST, type AuditContext } from "../../audit/index.js";
import {
  OtpService,
  PasswordConfirmationService,
  type AuthenticatedSession,
} from "../../identity/index.js";
import {
  PrivacyError,
  inactivityBounds,
  normalizeBlockers,
  type DeletionBlocker,
} from "../domain/privacy.js";
import {
  PERSONAL_DATA_STORE,
  PRIVACY_CLOCK,
  PRIVACY_TRANSACTION,
  type CollectedData,
  type PersonalDataStore,
  type PrivacyClock,
  type PrivacyTransaction,
} from "./ports.js";

/** Format de la copie : à changer si sa forme change (le titulaire ou un autre service peut la relire). */
export const EXPORT_FORMAT = "kemdia-donnees-personnelles/1";

export interface DataExport extends CollectedData {
  format: typeof EXPORT_FORMAT;
  generatedAt: string;
}

export interface DeletionInput {
  session: AuthenticatedSession;
  password: string;
  context: AuditContext;
}

/** Comptes traités au plus par passage de la nuit (la tâche ne monopolise jamais la base). */
const BATCH = 200;

export interface InactivityRun {
  notified: number;
  erased: number;
  /** Comptes prévenus, toujours inactifs, mais qu'une commande, une boutique… empêche d'effacer */
  blocked: number;
}

/**
 * Droits du titulaire sur ses données (S7-T08, ADR-0047 ; loi n°001/2011 modifiée, art. 43 à 59 et 70) :
 *
 * - **copie** de ses données (accès, portabilité) : un fichier JSON, sans mot de passe, jeton ni pièce d'identité ;
 * - **suppression** du compte : mot de passe actuel exigé (3 erreurs → blocage et session fermée), refusée tant qu'une
 *   commande, un remboursement, une boutique ou un rôle d'équipe est en cours. Tous les modules sont effacés dans UNE
 *   transaction ; les factures restent telles qu'émises (10 ans, OHADA, acheteur compris) ;
 * - **comptes inactifs** : prévenus 30 jours avant, effacés après 3 ans sans connexion.
 */
@Injectable()
export class PrivacyService {
  constructor(
    @Inject(PERSONAL_DATA_STORE) private readonly store: PersonalDataStore,
    @Inject(PRIVACY_TRANSACTION) private readonly transactions: PrivacyTransaction,
    @Inject(PRIVACY_CLOCK) private readonly clock: PrivacyClock,
    @Inject(PasswordConfirmationService)
    private readonly confirmation: Pick<PasswordConfirmationService, "confirm">,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
    @Inject(OtpService)
    private readonly notices: Pick<
      OtpService,
      "notifyAccountDeleted" | "notifyInactivity" | "canNotify"
    >,
  ) {}

  /** Copie des données du compte connecté ; la lecture est inscrite au journal d'audit. */
  async exportData(session: AuthenticatedSession, context: AuditContext): Promise<DataExport> {
    const accountId = session.account.id;
    // Une seule transaction : une photo cohérente de tous les modules
    const data = await this.transactions.run(() => this.store.collect(accountId));
    await this.audit.record({
      action: "account.data_exported",
      actor: { type: "account", id: accountId },
      target: { type: "account", id: accountId },
      details: {},
      context,
    });
    return { format: EXPORT_FORMAT, generatedAt: this.clock.now().toISOString(), ...data };
  }

  /** Ce qui empêche, aujourd'hui, de supprimer le compte (liste vide : suppression possible). */
  async deletionBlockers(accountId: string): Promise<DeletionBlocker[]> {
    return normalizeBlockers(await this.store.blockers(accountId));
  }

  /**
   * Suppression demandée par le titulaire. Mot de passe confirmé AVANT tout ; puis, dans une transaction : compte
   * verrouillé, empêchements revérifiés, effacement de tous les modules, journal d'audit. L'avis part ensuite vers
   * l'adresse lue avant l'effacement.
   */
  async deleteAccount(input: DeletionInput): Promise<void> {
    const account = await this.confirmation.confirm({
      session: input.session,
      password: input.password,
      action: "account-delete",
      context: input.context,
    });
    const { id, email, phone } = account.snapshot();
    const now = this.clock.now();
    await this.transactions.run(async () => {
      // Verrou : deux demandes simultanées n'effacent (et ne journalisent) qu'une fois
      if (!(await this.store.lock(id))) throw new PrivacyAlreadyErased();
      const [blocker] = normalizeBlockers(await this.store.blockers(id));
      if (blocker) throw new PrivacyError(blocker);
      await this.store.erase(id, now);
      await this.audit.record({
        action: "account.deleted",
        actor: { type: "account", id },
        target: { type: "account", id },
        details: { reason: "request" },
        context: input.context,
      });
    });
    const contact = email ?? phone;
    if (contact) this.notices.notifyAccountDeleted(contact);
  }

  /** Passage de la nuit : prévenir les comptes inactifs depuis près de 3 ans, effacer ceux prévenus il y a 30 jours. */
  async processInactiveAccounts(): Promise<InactivityRun> {
    const now = this.clock.now();
    const bounds = inactivityBounds(now);
    const result: InactivityRun = { notified: 0, erased: 0, blocked: 0 };

    for (const account of await this.store.inactiveToNotify(bounds.notifyBefore, BATCH)) {
      // Pas de canal d'envoi pour ce contact (SMS sans fournisseur) : pas d'avis, donc pas d'effacement — on
      // réessaiera une autre nuit (la politique promet un avis 30 jours avant ; relecture S7-T08)
      if (!account.contact || !this.notices.canNotify(account.contact)) continue;
      const contact = account.contact;
      const marked = await this.transactions.run(async () => {
        if (!(await this.store.markNotified(account.id, bounds.notifyBefore, now))) return false;
        await this.audit.record({
          action: "account.inactivity_notified",
          actor: { type: "system" },
          target: { type: "account", id: account.id },
          details: { deleteOn: bounds.deleteOn.toISOString().slice(0, 10) },
          context: NO_REQUEST,
        });
        return true;
      });
      if (!marked) continue;
      this.notices.notifyInactivity(contact, bounds.deleteOn);
      result.notified++;
    }

    for (const id of await this.store.noticedAndStillInactive(bounds.noticedBefore, BATCH)) {
      const outcome = await this.transactions.run(async () => {
        // Relu sous verrou : une connexion entre-temps annule l'avis (et l'effacement)
        const locked = await this.store.lock(id);
        if (
          !locked ||
          !locked.inactivityNoticeAt ||
          locked.inactivityNoticeAt >= bounds.noticedBefore ||
          locked.lastActiveAt >= locked.inactivityNoticeAt
        ) {
          return "skipped" as const;
        }
        if (normalizeBlockers(await this.store.blockers(id)).length > 0) return "blocked" as const;
        await this.store.erase(id, now);
        await this.audit.record({
          action: "account.deleted",
          actor: { type: "system" },
          target: { type: "account", id },
          details: { reason: "inactivity" },
          context: NO_REQUEST,
        });
        return "erased" as const;
      });
      if (outcome === "erased") result.erased++;
      if (outcome === "blocked") result.blocked++;
    }
    return result;
  }
}

/** Le compte a déjà été effacé (demande envoyée deux fois) : la session présentée ne vaut plus rien. */
export class PrivacyAlreadyErased extends Error {
  constructor() {
    super("compte déjà supprimé");
    this.name = "PrivacyAlreadyErased";
  }
}
