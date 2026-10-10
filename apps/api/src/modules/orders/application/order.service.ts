import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { codAvailability, estimateDelivery, getCity } from "@kemdia/contracts/delivery";
import { StockUnavailableError } from "../../catalog/index.js";
import { validateAddress } from "../domain/delivery-address.js";
import {
  clientCanCancel,
  initialState,
  MAX_OPEN_ORDERS,
  newReference,
  priceLines,
  validatePayment,
  type PaymentMethod,
} from "../domain/order.js";
import { OrdersError } from "../domain/orders-error.js";
import { CartService } from "./cart.service.js";
import {
  ORDER_RANDOM,
  ORDER_REPOSITORY,
  ORDER_STOCK,
  ORDERS_TRANSACTION,
  type OrderCursor,
  type OrderRecord,
  type OrderRepository,
  type OrderStock,
  type OrdersTransaction,
  type OrderSummaryRecord,
  type RandomBytes,
} from "./ports.js";

export interface OrderQuoteView {
  subtotal: number;
  deliveryFee: number;
  total: number;
  freeDeliveryThreshold: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  cartOk: boolean;
  cod: { allowed: boolean; reason?: string };
}

export interface CreateOrderInput {
  idempotencyKey: string;
  expectedTotal: number;
  delivery: {
    fullName: string;
    phone: string;
    cityId: string;
    neighborhood: string;
    landmark: string;
  };
  payment: { method: PaymentMethod; phone?: string | undefined };
}

/** Ville du contrat partagé, sous la forme attendue par le domaine. */
function cityRule(cityId: string) {
  const city = getCity(cityId);
  return city ? { id: city.id, name: city.name, neighborhoods: city.neighborhoods } : null;
}

/**
 * Commandes du compte connecté (S5-T02, ADR-0024).
 *
 * Création, en UNE transaction : panier verrouillé → commande déjà créée avec cette clé ? (idempotence) → stock
 * réservé ligne par ligne sur les variantes verrouillées (BR-012) → montants calculés à partir des prix lus sur ces
 * lignes (BR-004) → total comparé à celui affiché au client → commande enregistrée → panier vidé. Au moindre refus,
 * tout est annulé (y compris la réservation).
 */
@Injectable()
export class OrderService {
  private readonly logger = new Logger("Commandes");
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDERS_TRANSACTION) private readonly tx: OrdersTransaction,
    @Inject(ORDER_STOCK) private readonly stock: OrderStock,
    @Inject(ORDER_RANDOM) private readonly random: RandomBytes,
    private readonly carts: CartService,
  ) {}

  /** Total du panier pour une ville et un moyen de paiement (affiché avant de commander). */
  async quote(accountId: string, cityId: string): Promise<OrderQuoteView> {
    const estimate = estimateDelivery(cityId, 0);
    if (!estimate)
      throw new OrdersError("ADRESSE_INVALIDE", "ville : choisissez une ville de livraison");
    const cart = await this.carts.view(accountId);
    const delivery = estimateDelivery(cityId, cart.subtotal)!;
    const total = cart.subtotal + delivery.fee;
    const cod = codAvailability(cityId, total);
    return {
      subtotal: cart.subtotal,
      deliveryFee: delivery.fee,
      total,
      freeDeliveryThreshold: delivery.freeThreshold,
      deliveryDaysMin: delivery.daysMin,
      deliveryDaysMax: delivery.daysMax,
      cartOk: cart.ok,
      // Indiqué quel que soit le moyen choisi : le site grise l'option avec la raison (BR-011)
      cod: cod.allowed ? { allowed: true } : { allowed: false, reason: cod.reason },
    };
  }

  /** Crée la commande à partir du panier du compte ; `created: false` si cette clé avait déjà servi. */
  async create(
    accountId: string,
    input: CreateOrderInput,
  ): Promise<{ order: OrderRecord; created: boolean }> {
    // Vérifications sans base d'abord : rien n'est verrouillé pour une adresse mal saisie
    const address = validateAddress(input.delivery, cityRule(input.delivery.cityId));
    const payment = validatePayment(input.payment.method, input.payment.phone);
    const idempotencyKey = input.idempotencyKey.toLowerCase();
    // Empreinte de ce qui est demandé : une clé déjà utilisée pour une autre commande est refusée (pas de confusion)
    const requestHash = createHash("sha256")
      .update(JSON.stringify([address, payment, input.expectedTotal]))
      .digest("hex");

    return this.tx.run(async () => {
      const cart = await this.orders.lockCart(accountId);
      const existing = await this.orders.findByIdempotencyKey(accountId, idempotencyKey);
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new OrdersError(
            "CLE_DEJA_UTILISEE",
            "cette demande a déjà servi pour une autre commande : rechargez la page",
          );
        }
        return { order: existing, created: false };
      }
      if (!cart || cart.lines.length === 0) {
        throw new OrdersError("PANIER_VIDE", "votre panier est vide");
      }
      // Le panier verrouillé sérialise les commandes d'un même compte : le compte ne peut pas dépasser la limite
      if ((await this.orders.countOpen(accountId)) >= MAX_OPEN_ORDERS) {
        throw new OrdersError(
          "TROP_DE_COMMANDES_OUVERTES",
          `vous avez déjà ${MAX_OPEN_ORDERS} commandes en cours : payez-en ou annulez-en une avant d'en passer une autre`,
        );
      }

      let reserved;
      try {
        reserved = await this.stock.reserve(cart.lines);
      } catch (error) {
        if (error instanceof StockUnavailableError) {
          throw new OrdersError(
            "PANIER_A_VERIFIER",
            "un article de votre panier n'est plus disponible comme demandé : vérifiez votre panier",
          );
        }
        throw error;
      }
      // Ordre du panier conservé dans la commande
      const position = new Map(cart.lines.map((l, i) => [l.variantId, i]));
      reserved.sort((a, b) => (position.get(a.variantId) ?? 0) - (position.get(b.variantId) ?? 0));
      const { lines, subtotal } = priceLines(
        reserved.map((r) => ({
          variantId: r.variantId,
          productId: r.productId,
          title: r.title,
          variantName: r.variantName,
          image: r.image,
          unitPrice: r.price,
          quantity: r.quantity,
        })),
      );
      const delivery = estimateDelivery(address.cityId, subtotal)!;
      const total = subtotal + delivery.fee;
      if (total !== input.expectedTotal) {
        throw new OrdersError(
          "PRIX_MODIFIE",
          "le total de votre commande a changé (prix ou livraison) : vérifiez le nouveau montant",
        );
      }
      if (payment.method === "cod") {
        const cod = codAvailability(address.cityId, total);
        if (!cod.allowed) throw new OrdersError("PAIEMENT_A_LA_LIVRAISON_INDISPONIBLE", cod.reason);
      }

      const now = this.clock();
      const order = await this.orders.insert(
        {
          accountId,
          idempotencyKey,
          requestHash,
          ...initialState(payment.method, now),
          paymentMethod: payment.method,
          paymentPhone: payment.phone,
          subtotal,
          deliveryFee: delivery.fee,
          total,
          delivery: { ...address, daysMin: delivery.daysMin, daysMax: delivery.daysMax },
          lines,
        },
        now,
        () => newReference(this.random),
      );
      await this.orders.removeCartLines(
        cart.cartId,
        lines.map((l) => l.variantId),
      );
      return { order, created: true };
    });
  }

  async get(accountId: string, reference: string): Promise<OrderRecord> {
    const order = await this.orders.findByReference(accountId, reference);
    if (!order) throw notFound();
    return order;
  }

  list(
    accountId: string,
    limit: number,
    before?: OrderCursor,
  ): Promise<{ items: OrderSummaryRecord[]; next: OrderCursor | null }> {
    return this.orders.list(accountId, limit, before);
  }

  /**
   * Annulation par le client, avant l'expédition (choix du 2026-10-10 ; BR-010). Le stock est remis en vente dans la
   * même transaction. Une commande déjà annulée est renvoyée telle quelle.
   */
  async cancel(accountId: string, reference: string): Promise<OrderRecord> {
    return this.tx.run(async () => {
      const order = await this.orders.findByReference(accountId, reference, true);
      if (!order) throw notFound();
      if (order.status === "cancelled") return order;
      if (!clientCanCancel(order.status, order.paymentMethod)) {
        throw new OrdersError(
          "ANNULATION_IMPOSSIBLE",
          order.status === "shipped" || order.status === "delivered"
            ? "cette commande est déjà partie : contactez le service client"
            : "cette commande est déjà payée : contactez le service client pour l'annuler et être remboursé",
        );
      }
      await this.stock.release(order.lines);
      await this.orders.setStatus(order.id, "cancelled", this.clock(), "client");
      return (await this.orders.findByReference(accountId, order.reference))!;
    });
  }

  /**
   * Paiement Mobile Money non reçu à temps : commande annulée, stock remis en vente (tâche planifiée).
   * Chaque commande dans sa propre transaction ; une commande verrouillée ailleurs est laissée pour le passage suivant.
   */
  async cancelOverdue(now = this.clock(), budgetMs = 30_000): Promise<number> {
    const started = Date.now();
    let count = 0;
    // Par lots de 100, jusqu'à ce qu'il n'en reste plus (ou que le passage ait assez duré)
    for (;;) {
      const batch = await this.orders.findOverdue(now, 100);
      let progressed = false;
      for (const id of batch) {
        try {
          const done = await this.tx.run(async () => {
            const order = await this.orders.lockById(id);
            if (!order || order.status !== "pending_payment" || !order.paymentDueAt) return false;
            if (order.paymentDueAt > now) return false;
            await this.stock.release(order.lines);
            await this.orders.setStatus(order.id, "cancelled", now, "paiement_expire");
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
      // Lot incomplet, rien n'a avancé (commandes verrouillées ailleurs) ou temps écoulé : au passage suivant
      if (batch.length < 100 || !progressed || Date.now() - started > budgetMs) return count;
    }
  }
}

function notFound(): OrdersError {
  return new OrdersError("COMMANDE_INTROUVABLE", "commande introuvable");
}
