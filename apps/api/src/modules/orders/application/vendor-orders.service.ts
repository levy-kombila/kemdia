import { Inject, Injectable, Logger } from "@nestjs/common";
import { AuditLog, NO_REQUEST } from "../../audit/index.js";
import type { CancelReason } from "../domain/order.js";
import { OrdersError } from "../domain/orders-error.js";
import {
  allAccepted,
  canDecide,
  hasVendorPart,
  refusalReasonOf,
  type VendorView,
} from "../domain/shop-part.js";
import { OrderCancelHooks } from "./order-cancel-hooks.js";
import {
  COUPON_REPOSITORY,
  ORDER_REPOSITORY,
  ORDER_STOCK,
  ORDERS_TRANSACTION,
  type CouponRepository,
  type OrderRecord,
  type OrderRepository,
  type OrderStock,
  type OrdersTransaction,
  type VendorEmailRecord,
  type VendorOrderCursor,
  type VendorOrderRecord,
  type VendorOrderSummaryRecord,
} from "./ports.js";

/** Essais d'envoi de l'e-mail « nouvelle commande » au plus (même rythme que les factures). */
export const VENDOR_EMAIL_MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [60_000, 10 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
/** Délai avant l'essai `attempt` + 1 (1 min, 10 min, 1 h, puis 6 h). */
export const vendorEmailRetryDelayMs = (attempt: number) =>
  RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]!;

/**
 * Commandes vues et décidées par les boutiques (S6-T07, ADR-0038 ; BR-013). Port public du module orders pour le
 * module vendors : celui-ci vérifie D'ABORD que le compte a une boutique active (verrouillée en partage), puis passe
 * l'identifiant de SA boutique ; jamais une boutique reçue de la requête.
 *
 * - Accepter : la part passe « acceptée » ; quand toutes les parts de vendeurs le sont, la commande passe « en
 *   préparation ».
 * - Refuser (motif obligatoire, gardé chez Kemdia), ou ne pas répondre dans les 24 h : la commande ENTIÈRE est annulée
 *   (choix du 2026-10-17) — stock remis en vente, coupon rendu, et le module payments (crochet `onVendorCancel`)
 *   expire les essais en attente, note le remboursement « à faire » d'une commande payée et émet l'avoir.
 *
 * Tout se passe dans la transaction des commandes, commande verrouillée (ordre des verrous : commande → variantes →
 * coupon → paiement, comme les autres annulations).
 */
@Injectable()
export class VendorOrders {
  private readonly logger = new Logger("Commandes des vendeurs");
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDERS_TRANSACTION) private readonly tx: OrdersTransaction,
    @Inject(ORDER_STOCK) private readonly stock: OrderStock,
    @Inject(COUPON_REPOSITORY) private readonly coupons: CouponRepository,
    private readonly cancelHooks: OrderCancelHooks,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
  ) {}

  list(
    shopId: string,
    query: { view?: VendorView | undefined; limit: number; before?: VendorOrderCursor | undefined },
  ): Promise<{ items: VendorOrderSummaryRecord[]; next: VendorOrderCursor | null }> {
    return this.orders.listForShop(shopId, query);
  }

  async get(shopId: string, reference: string): Promise<VendorOrderRecord> {
    const order = await this.orders.findForShop(shopId, reference);
    if (!order) throw notFound();
    return order;
  }

  /** La boutique peut-elle encore décider (affichage des boutons) ? */
  canDecide(order: VendorOrderSummaryRecord, now = this.clock()): boolean {
    return canDecide(order.part, order.orderStatus, now);
  }

  /**
   * Accepte la part de la boutique. Déjà acceptée : renvoyée telle quelle (`changed: false`, double envoi du
   * formulaire). `preparing` : la commande vient de passer « en préparation ».
   */
  accept(
    shopId: string,
    accountId: string,
    reference: string,
  ): Promise<{ order: VendorOrderRecord; changed: boolean; preparing: boolean }> {
    return this.tx.run(async () => {
      const found = await this.orders.findForShop(shopId, reference, true);
      if (!found) throw notFound();
      if (found.part.status === "accepted") {
        return { order: found, changed: false, preparing: false };
      }
      const now = this.clock();
      if (!canDecide(found.part, found.orderStatus, now)) throw impossible();
      await this.orders.decideShopPart(
        found.orderId,
        shopId,
        { status: "accepted", by: accountId },
        now,
      );
      const order = (await this.orders.findByReference(null, found.reference))!;
      let preparing = false;
      if (
        order.status === "confirmed" &&
        hasVendorPart(order.shopParts) &&
        allAccepted(order.shopParts)
      ) {
        await this.orders.setStatus(order.id, "preparing", now);
        preparing = true;
      }
      return {
        order: (await this.orders.findForShop(shopId, reference))!,
        changed: true,
        preparing,
      };
    });
  }

  /**
   * Refuse la part de la boutique : la commande ENTIÈRE est annulée. Déjà refusée : renvoyée telle quelle
   * (`changed: false`). Le motif est vérifié avant tout verrou.
   */
  refuse(
    shopId: string,
    accountId: string,
    reference: string,
    rawReason: string,
  ): Promise<{ order: VendorOrderRecord; changed: boolean; reason: string }> {
    const reason = refusalReasonOf(rawReason);
    return this.tx.run(async () => {
      const found = await this.orders.findForShop(shopId, reference, true);
      if (!found) throw notFound();
      if (found.part.status === "refused") return { order: found, changed: false, reason };
      const now = this.clock();
      if (!canDecide(found.part, found.orderStatus, now)) throw impossible();
      await this.orders.decideShopPart(
        found.orderId,
        shopId,
        { status: "refused", by: accountId, reason },
        now,
      );
      const order = (await this.orders.findByReference(null, found.reference))!;
      await this.cancelWhole(order, "vendeur_refus", now);
      return { order: (await this.orders.findForShop(shopId, reference))!, changed: true, reason };
    });
  }

  /**
   * Parts sans réponse après 24 h : commande entière annulée (tâche planifiée, chaque minute). Chaque commande dans sa
   * propre transaction ; une commande verrouillée ailleurs est laissée pour le passage suivant. Renvoie le nombre annulé.
   */
  async expireOverdue(now = this.clock(), budgetMs = 30_000): Promise<number> {
    const started = Date.now();
    let count = 0;
    for (;;) {
      const batch = await this.orders.findVendorOverdue(now, 100);
      let progressed = false;
      for (const id of batch) {
        try {
          const done = await this.tx.run(async () => {
            const order = await this.orders.lockById(id);
            if (!order || order.status !== "confirmed") return false;
            const late = order.shopParts.filter(
              (p) => p.status === "pending" && p.dueAt !== null && p.dueAt <= now,
            );
            if (late.length === 0) return false;
            for (const part of late) {
              await this.orders.decideShopPart(order.id, part.shopId, { status: "expired" }, now);
            }
            await this.cancelWhole(order, "vendeur_delai", now);
            await this.audit.record({
              action: "order.vendor_timeout",
              actor: { type: "system" },
              target: { type: "order", id: order.id },
              details: { reference: order.reference, shops: late.length },
              context: NO_REQUEST,
            });
            return true;
          });
          if (done) {
            count++;
            progressed = true;
          }
        } catch (error) {
          this.logger.warn(
            `annulation automatique impossible : ${error instanceof Error ? error.name : "erreur inconnue"}`,
          );
        }
      }
      if (batch.length < 100 || !progressed || Date.now() - started > budgetMs) return count;
    }
  }

  // --- E-mail « nouvelle commande » (envoyé par le module vendors, qui connaît le vendeur) ---

  dueEmails(now: Date, limit: number): Promise<VendorEmailRecord[]> {
    return this.orders.findDueVendorEmails(now, limit);
  }

  claimEmail(email: VendorEmailRecord, now: Date): Promise<boolean> {
    const next = new Date(now.getTime() + vendorEmailRetryDelayMs(email.emailAttempts + 1));
    return this.orders.claimVendorEmail(email.orderId, email.shopId, now, next);
  }

  markEmailSent(email: VendorEmailRecord, now: Date): Promise<void> {
    return this.orders.markVendorEmailSent(email.orderId, email.shopId, now);
  }

  giveUpEmail(email: VendorEmailRecord): Promise<void> {
    return this.orders.giveUpVendorEmail(email.orderId, email.shopId);
  }

  /** Annulation de la commande entière à cause d'un vendeur (commande verrouillée, dans la transaction). */
  private async cancelWhole(order: OrderRecord, reason: CancelReason, now: Date): Promise<void> {
    await this.stock.release(order.lines);
    await this.coupons.releaseForOrder(order.id, now);
    await this.orders.setStatus(order.id, "cancelled", now, reason);
    // Paiements : essais expirés, remboursement « à faire », avoir (module payments, S6-T07)
    await this.cancelHooks.runVendor(order, now);
  }
}

function notFound(): OrdersError {
  return new OrdersError("COMMANDE_INTROUVABLE", "commande introuvable");
}

function impossible(): OrdersError {
  return new OrdersError(
    "DECISION_IMPOSSIBLE",
    "cette commande n'attend plus votre réponse (déjà traitée, annulée, ou délai passé)",
  );
}
