import { createHash } from "node:crypto";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { codAvailability, estimateDelivery, getCity } from "@kemdia/contracts/delivery";
import { StockUnavailableError } from "../../catalog/index.js";
import {
  assertUsable,
  computeDiscount,
  normalizeCouponCode,
  type Coupon,
  type DiscountLine,
} from "../domain/coupon.js";
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
import { OrderCancelHooks } from "./order-cancel-hooks.js";
import {
  COD_SETTINGS_REPOSITORY,
  COUPON_REPOSITORY,
  MOBILE_MONEY,
  ORDER_RANDOM,
  ORDER_REPOSITORY,
  ORDER_STOCK,
  ORDERS_TRANSACTION,
  type CodSettingsRepository,
  type CouponRepository,
  type MobileMoneyAvailability,
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
  discount: number;
  coupon: { code: string; discount: number } | null;
  deliveryFee: number;
  total: number;
  freeDeliveryThreshold: number;
  deliveryDaysMin: number;
  deliveryDaysMax: number;
  cartOk: boolean;
  cod: { allowed: boolean; reason?: string };
  /** Un fournisseur Mobile Money existe sur cet environnement (S5-T07) */
  mobileMoney: { allowed: boolean };
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
  couponCode?: string | undefined;
}

/**
 * Codes coupons refusés par compte : au-delà de 10 en 15 minutes, `COUPON_TROP_D_ESSAIS` (on n'essaie pas des codes au
 * hasard — relecture de sécurité du S5-T03). Compteurs en mémoire, comme les autres limites (une instance au MVP).
 */
export const COUPON_FAILURES_MAX = 10;
export const COUPON_FAILURES_WINDOW_MS = 15 * 60_000;

export class CouponAttempts {
  private readonly failures = new Map<string, number[]>();

  /** Lève `COUPON_TROP_D_ESSAIS` si le compte a déjà trop d'échecs récents. */
  check(accountId: string, now: number): void {
    const recent = this.recent(accountId, now);
    if (recent.length >= COUPON_FAILURES_MAX) {
      const retry = Math.max(1, Math.ceil((recent[0]! + COUPON_FAILURES_WINDOW_MS - now) / 1000));
      throw new OrdersError(
        "COUPON_TROP_D_ESSAIS",
        "trop de codes coupons refusés : réessayez plus tard",
        retry,
      );
    }
  }

  fail(accountId: string, now: number): void {
    const recent = this.recent(accountId, now);
    recent.push(now);
    this.failures.set(accountId, recent);
    // Ménage : la carte ne grossit pas sans fin
    if (this.failures.size > 10_000) {
      for (const [key, times] of this.failures) {
        if (times.every((t) => now - t >= COUPON_FAILURES_WINDOW_MS)) this.failures.delete(key);
      }
    }
  }

  private recent(accountId: string, now: number): number[] {
    return (this.failures.get(accountId) ?? []).filter((t) => now - t < COUPON_FAILURES_WINDOW_MS);
  }
}

/** Code coupon saisi : normalisé, ou `COUPON_INVALIDE` (même réponse qu'un code inconnu). */
function couponCodeOf(input: string | undefined): string | null {
  if (input === undefined) return null;
  const code = normalizeCouponCode(input);
  if (!code) throw new OrdersError("COUPON_INVALIDE", "ce code coupon n'est pas valable");
  return code;
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
  /** Codes coupons refusés, par compte (limite contre la recherche de codes au hasard). */
  readonly couponAttempts = new CouponAttempts();
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    @Inject(ORDERS_TRANSACTION) private readonly tx: OrdersTransaction,
    @Inject(ORDER_STOCK) private readonly stock: OrderStock,
    @Inject(ORDER_RANDOM) private readonly random: RandomBytes,
    private readonly carts: CartService,
    @Inject(COUPON_REPOSITORY) private readonly coupons: CouponRepository,
    @Inject(COD_SETTINGS_REPOSITORY) private readonly codSettings: CodSettingsRepository,
    @Inject(MOBILE_MONEY) private readonly mobileMoney: MobileMoneyAvailability,
    private readonly cancelHooks: OrderCancelHooks,
  ) {}

  /**
   * Réduction d'un coupon pour ce compte (BR-030) ; `lock` : le coupon est verrouillé (création de commande), ainsi le
   * compteur et les utilisations du compte relus ici sont ceux qui comptent.
   */
  private async discountFor(
    code: string,
    accountId: string,
    lines: readonly DiscountLine[],
    now: Date,
    lock: boolean,
  ): Promise<{ coupon: Coupon; discount: number }> {
    this.couponAttempts.check(accountId, now.getTime());
    try {
      const coupon = lock
        ? await this.coupons.lockByCode(code)
        : await this.coupons.findByCode(code);
      if (!coupon) throw new OrdersError("COUPON_INVALIDE", "ce code coupon n'est pas valable");
      assertUsable(coupon, now, await this.coupons.countUses(coupon.id, accountId));
      return { coupon, discount: computeDiscount(coupon, lines) };
    } catch (error) {
      if (error instanceof OrdersError && error.code.startsWith("COUPON_")) {
        this.couponAttempts.fail(accountId, now.getTime());
      }
      throw error;
    }
  }

  /** Total du panier pour une ville et un moyen de paiement (affiché avant de commander). */
  async quote(accountId: string, cityId: string, rawCoupon?: string): Promise<OrderQuoteView> {
    const estimate = estimateDelivery(cityId, 0);
    if (!estimate)
      throw new OrdersError("ADRESSE_INVALIDE", "ville : choisissez une ville de livraison");
    const code = couponCodeOf(rawCoupon);
    const cart = await this.carts.view(accountId);
    let applied: { code: string; discount: number } | null = null;
    if (code) {
      const lines = cart.lines
        .filter((l) => l.ok)
        .map((l) => ({ lineTotal: l.price * l.quantity, onSale: l.compareAtPrice !== null }));
      // Panier vide : on ne regarde pas le code (sa réponse ne doit rien dire de son existence)
      if (lines.length === 0) throw new OrdersError("PANIER_VIDE", "votre panier est vide");
      const { coupon, discount } = await this.discountFor(
        code,
        accountId,
        lines,
        this.clock(),
        false,
      );
      applied = { code: coupon.code, discount };
    }
    const discount = applied?.discount ?? 0;
    // Livraison offerte et paiement à la livraison : calculés sur ce que le client paie pour ses articles
    const delivery = estimateDelivery(cityId, cart.subtotal - discount)!;
    const total = cart.subtotal - discount + delivery.fee;
    // Réglage de l'administrateur (S5-T04, BR-011)
    const cod = codAvailability(cityId, total, await this.codSettings.get());
    return {
      subtotal: cart.subtotal,
      discount,
      coupon: applied,
      deliveryFee: delivery.fee,
      total,
      freeDeliveryThreshold: delivery.freeThreshold,
      deliveryDaysMin: delivery.daysMin,
      deliveryDaysMax: delivery.daysMax,
      cartOk: cart.ok,
      // Indiqué quel que soit le moyen choisi : le site grise l'option avec la raison (BR-011)
      cod: cod.allowed ? { allowed: true } : { allowed: false, reason: cod.reason },
      mobileMoney: { allowed: this.mobileMoney.available },
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
    const couponCode = couponCodeOf(input.couponCode);
    const idempotencyKey = input.idempotencyKey.toLowerCase();
    // Empreinte de ce qui est demandé : une clé déjà utilisée pour une autre commande est refusée (pas de confusion)
    const requestHash = createHash("sha256")
      .update(JSON.stringify([address, payment, input.expectedTotal, couponCode]))
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
      // Sans fournisseur, la commande ne pourrait jamais être payée : refusée avant de toucher au stock (S5-T07).
      // Après la clé d'idempotence : une commande déjà créée est toujours rendue telle quelle (relecture S5-T07)
      if (payment.method !== "cod" && !this.mobileMoney.available) {
        throw new OrdersError(
          "MOBILE_MONEY_INDISPONIBLE",
          "le paiement Mobile Money n'est pas encore disponible : choisissez le paiement à la livraison",
        );
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
      const now = this.clock();
      // Coupon : verrouillé APRÈS les variantes (ordre des verrous identique à l'annulation : pas d'interblocage)
      let applied: { coupon: Coupon; discount: number } | null = null;
      if (couponCode) {
        const onSale = new Map(reserved.map((r) => [r.variantId, r.compareAtPrice !== null]));
        applied = await this.discountFor(
          couponCode,
          accountId,
          lines.map((l) => ({ lineTotal: l.lineTotal, onSale: onSale.get(l.variantId) ?? false })),
          now,
          true,
        );
      }
      const discount = applied?.discount ?? 0;
      const delivery = estimateDelivery(address.cityId, subtotal - discount)!;
      const total = subtotal - discount + delivery.fee;
      if (total !== input.expectedTotal) {
        throw new OrdersError(
          "PRIX_MODIFIE",
          "le total de votre commande a changé (prix ou livraison) : vérifiez le nouveau montant",
        );
      }
      if (payment.method === "cod") {
        const cod = codAvailability(address.cityId, total, await this.codSettings.get());
        if (!cod.allowed) throw new OrdersError("PAIEMENT_A_LA_LIVRAISON_INDISPONIBLE", cod.reason);
      }

      const order = await this.orders.insert(
        {
          accountId,
          idempotencyKey,
          requestHash,
          ...initialState(payment.method, now),
          paymentMethod: payment.method,
          paymentPhone: payment.phone,
          subtotal,
          discount,
          couponCode: applied?.coupon.code ?? null,
          deliveryFee: delivery.fee,
          total,
          delivery: { ...address, daysMin: delivery.daysMin, daysMax: delivery.daysMax },
          lines,
        },
        now,
        () => newReference(this.random),
      );
      if (applied) {
        await this.coupons.redeem({
          couponId: applied.coupon.id,
          orderId: order.id,
          accountId,
          amount: applied.discount,
          now,
        });
      }
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
      if (!clientCanCancel(order.status, order.paymentMethod, order.paidAt !== null)) {
        throw new OrdersError(
          "ANNULATION_IMPOSSIBLE",
          order.status === "shipped" || order.status === "delivered"
            ? "cette commande est déjà partie : contactez le service client"
            : "cette commande est déjà payée : contactez le service client pour l'annuler et être remboursé",
        );
      }
      const now = this.clock();
      await this.stock.release(order.lines);
      // Utilisation du coupon rendue (choix du 2026-10-10)
      await this.coupons.releaseForOrder(order.id, now);
      await this.orders.setStatus(order.id, "cancelled", now, "client");
      // Demandes de paiement encore en attente : expirées dans la même transaction (module payments, S5-T07)
      await this.cancelHooks.run(order, now);
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
            await this.coupons.releaseForOrder(order.id, now);
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
