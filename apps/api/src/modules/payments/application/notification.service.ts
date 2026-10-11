import { Inject, Injectable } from "@nestjs/common";
import { OrderPayments } from "../../orders/index.js";
import { verifyNotification } from "../domain/webhook-signature.js";
import { PaymentsError } from "../domain/payments-error.js";
import { PaymentService } from "./payment.service.js";
import {
  PROVIDER_EVENT_REPOSITORY,
  WEBHOOK_KEY,
  type ProviderEventRepository,
  type WebhookKey,
} from "./ports.js";

/** Notification de l'opérateur, déjà validée par le schéma du contrat. */
export interface ProviderNotification {
  eventId: string;
  type: "payment.succeeded" | "payment.failed";
  paymentId: string;
  providerRef: string;
  amount?: number | undefined;
  failureReason?: string | undefined;
}

/**
 * Notifications signées de l'opérateur Mobile Money (S5-T05, ADR-0027 ; faille CRIT-01 de l'ancien site : une commande
 * ne passe « payée » que sur une notification signée vérifiée par le serveur).
 *
 * 1. `authenticate` : signature HMAC sur le corps BRUT et l'horodatage, fenêtre de 5 minutes ;
 * 2. `receive` : en UNE transaction, la notification est inscrite (son identifiant n'est accepté qu'une fois : un rejeu
 *    est ignoré sans rien changer) puis son résultat appliqué (`PaymentService.applyProviderResult`). Au moindre refus,
 *    rien n'est gardé : l'opérateur pourra la renvoyer.
 */
@Injectable()
export class NotificationService {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    private readonly orders: OrderPayments,
    private readonly payments: PaymentService,
    @Inject(PROVIDER_EVENT_REPOSITORY) private readonly events: ProviderEventRepository,
    @Inject(WEBHOOK_KEY) private readonly key: WebhookKey,
  ) {}

  /** Lève `PAIEMENT_INDISPONIBLE` (aucun opérateur), `SIGNATURE_INVALIDE` ou `NOTIFICATION_EXPIREE`. */
  authenticate(signature: string | undefined, rawBody: Uint8Array | undefined): void {
    if (!this.key.secret) {
      throw new PaymentsError(
        "PAIEMENT_INDISPONIBLE",
        "aucun opérateur Mobile Money n'est branché",
      );
    }
    const check = rawBody
      ? verifyNotification(
          signature,
          rawBody,
          this.key.secret,
          Math.floor(this.clock().getTime() / 1000),
        )
      : "invalide";
    if (check === "invalide") throw new PaymentsError("SIGNATURE_INVALIDE", "signature invalide");
    if (check === "expiree") {
      throw new PaymentsError("NOTIFICATION_EXPIREE", "notification trop ancienne : refusée");
    }
  }

  /** Applique une notification authentifiée ; `duplicate` : déjà reçue, rien n'a changé. */
  async receive(notification: ProviderNotification): Promise<{ duplicate: boolean }> {
    return this.orders.transaction(async () => {
      const fresh = await this.events.record(
        { id: notification.eventId, paymentId: notification.paymentId, type: notification.type },
        this.clock(),
      );
      if (!fresh) return { duplicate: true };
      await this.payments.applyProviderResult({
        paymentId: notification.paymentId,
        providerRef: notification.providerRef,
        outcome: notification.type === "payment.succeeded" ? "succeeded" : "failed",
        amount: notification.amount,
        failureReason: notification.failureReason,
      });
      return { duplicate: false };
    });
  }
}
