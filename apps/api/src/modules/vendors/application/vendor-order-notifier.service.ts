import { Inject, Injectable, Logger } from "@nestjs/common";
import { AccountDirectory } from "../../identity/index.js";
import { VendorOrders } from "../../orders/index.js";
import {
  SHOP_REPOSITORY,
  VENDOR_ORDER_MAILER,
  type ShopRepository,
  type VendorOrderMailer,
} from "./ports.js";

/** Le module orders, vu par l'envoi des e-mails (remplaçable dans les tests). */
export type VendorEmailOutbox = Pick<
  VendorOrders,
  "dueEmails" | "claimEmail" | "markEmailSent" | "giveUpEmail"
>;

/**
 * E-mail « nouvelle commande » au vendeur (S6-T07, ADR-0038), envoyé APRÈS la transaction de la commande par une tâche
 * planifiée : un e-mail lent ne bloque jamais une commande ni un paiement. Comme les factures : chaque envoi est d'abord
 * RÉSERVÉ (deux instances n'envoient pas le même e-mail ; une panne repousse l'essai : 1 min, 10 min, 1 h, 6 h ; 5 au
 * plus). Plus rien à annoncer (commande décidée, annulée, délai passé), boutique inactive ou propriétaire sans adresse
 * e-mail vérifiée : l'envoi est abandonné (le tableau de bord du vendeur montre toujours ses commandes à traiter).
 */
@Injectable()
export class VendorOrderNotifier {
  private readonly logger = new Logger("Commandes des vendeurs (e-mails)");
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(VendorOrders) private readonly outbox: VendorEmailOutbox,
    @Inject(SHOP_REPOSITORY) private readonly shops: Pick<ShopRepository, "findById">,
    @Inject(AccountDirectory) private readonly directory: Pick<AccountDirectory, "contactOf">,
    @Inject(VENDOR_ORDER_MAILER) private readonly mailer: VendorOrderMailer,
  ) {}

  /** Envoie les e-mails dont c'est l'heure ; renvoie le nombre envoyé. */
  async sendPending(limit = 20): Promise<number> {
    if (!this.mailer.available) return 0;
    let sent = 0;
    const now = this.clock();
    for (const email of await this.outbox.dueEmails(now, limit)) {
      if (
        email.partStatus !== "pending" ||
        email.orderStatus !== "confirmed" ||
        email.dueAt.getTime() <= now.getTime()
      ) {
        await this.outbox.giveUpEmail(email);
        continue;
      }
      const shop = await this.shops.findById(email.shopId);
      const contact = shop?.ownerAccountId
        ? await this.directory.contactOf(shop.ownerAccountId)
        : null;
      if (!shop || shop.status !== "active" || !contact?.email) {
        await this.outbox.giveUpEmail(email);
        this.logger.warn(
          `${email.reference} : boutique sans adresse e-mail vérifiée, envoi abandonné`,
        );
        continue;
      }
      if (!(await this.outbox.claimEmail(email, now))) continue;
      let delivered = false;
      try {
        await this.mailer.send(contact.email, {
          firstName: contact.firstName,
          shopName: shop.name,
          reference: email.reference,
          itemCount: email.itemCount,
          subtotal: email.subtotal,
          dueAt: email.dueAt,
        });
        delivered = true;
      } catch (error) {
        const last = email.emailAttempts + 1 >= 5;
        this.logger.warn(
          `e-mail de ${email.reference} impossible${last ? " — abandonné après 5 essais" : ""} : ${
            error instanceof Error ? error.message : "erreur inconnue"
          }`,
        );
      }
      // Hors du bloc précédent : un e-mail parti n'est jamais compté comme un échec
      if (delivered) {
        await this.outbox.markEmailSent(email, this.clock());
        sent++;
      }
    }
    return sent;
  }
}
