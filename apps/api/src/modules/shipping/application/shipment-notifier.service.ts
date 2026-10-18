import { Inject, Injectable, Logger } from "@nestjs/common";
import { AccountDirectory } from "../../identity/index.js";
import {
  SHIPMENT_EMAILS,
  SHIPMENT_MAILER,
  type ShipmentEmailOutbox,
  type ShipmentEmailRecord,
  type ShipmentMailer,
} from "./ports.js";

/** 5 essais au plus : 1 min, 10 min, 1 h, 6 h entre deux essais (comme les e-mails aux vendeurs). */
export const MAX_EMAIL_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
export const shipmentEmailRetryDelayMs = (attempt: number) =>
  RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]!;

/** L'e-mail a-t-il encore un sens ? « En route » : pas si la commande est déjà livrée ou annulée. */
function stillRelevant(email: ShipmentEmailRecord): boolean {
  return email.kind === "delivered"
    ? email.shipmentStatus === "delivered"
    : email.shipmentStatus === "in_transit" || email.shipmentStatus === "failed";
}

/**
 * E-mails de livraison au client (S7-T02, ADR-0041) : « en route » et « livrée », envoyés APRÈS la transaction de
 * l'étape par une tâche planifiée (un e-mail lent ne bloque jamais l'équipe). Chaque envoi est d'abord RÉSERVÉ ; une
 * panne repousse l'essai. Plus d'objet (commande déjà livrée ou annulée) ou client sans adresse e-mail vérifiée :
 * abandon (le client suit toujours sa commande dans son compte). Jamais le motif d'un échec.
 */
@Injectable()
export class ShipmentNotifier {
  private readonly logger = new Logger("Livraisons (e-mails)");
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(SHIPMENT_EMAILS) private readonly outbox: ShipmentEmailOutbox,
    @Inject(AccountDirectory) private readonly directory: Pick<AccountDirectory, "contactOf">,
    @Inject(SHIPMENT_MAILER) private readonly mailer: ShipmentMailer,
  ) {}

  /** Envoie les e-mails dont c'est l'heure ; renvoie le nombre envoyé. */
  async sendPending(limit = 20): Promise<number> {
    if (!this.mailer.available) return 0;
    let sent = 0;
    const now = this.clock();
    for (const email of await this.outbox.due(now, limit)) {
      if (!stillRelevant(email)) {
        await this.outbox.giveUp(email.id);
        continue;
      }
      const contact = await this.directory.contactOf(email.accountId);
      if (!contact?.email) {
        await this.outbox.giveUp(email.id);
        this.logger.warn(`${email.orderReference} : client sans adresse e-mail vérifiée`);
        continue;
      }
      const next = new Date(now.getTime() + shipmentEmailRetryDelayMs(email.attempts + 1));
      if (!(await this.outbox.claim(email.id, now, next))) continue;
      let delivered = false;
      try {
        await this.mailer.send(contact.email, email.kind, {
          firstName: contact.firstName,
          reference: email.orderReference,
          cityName: email.cityName,
        });
        delivered = true;
      } catch (error) {
        const last = email.attempts + 1 >= MAX_EMAIL_ATTEMPTS;
        this.logger.warn(
          `e-mail de livraison de ${email.orderReference} impossible${last ? " — abandonné après 5 essais" : ""} : ${
            error instanceof Error ? error.message : "erreur inconnue"
          }`,
        );
      }
      // Hors du bloc précédent : un e-mail parti n'est jamais compté comme un échec
      if (delivered) {
        await this.outbox.markSent(email.id, this.clock());
        sent++;
      }
    }
    return sent;
  }
}
