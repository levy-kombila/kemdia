import { Inject, Injectable } from "@nestjs/common";
import { AuditLog, type AuditContext } from "../../audit/index.js";
import { OrderShipping, type OrderRecord } from "../../orders/index.js";
import {
  canMove,
  cleanText,
  deliveryShares,
  SHIPPING_RULES,
  type ShipmentStatus,
} from "../domain/shipment.js";
import { ShippingError } from "../domain/shipping-error.js";
import {
  CARRIER,
  SHIPMENT_REPOSITORY,
  SHIPPING_RANDOM,
  type Carrier,
  type ShipmentRecord,
  type ShipmentRepository,
  type ShippingRandom,
} from "./ports.js";

export type ShipmentResult = { shipment: ShipmentRecord; changed: boolean };

/**
 * Suivi des livraisons par l'équipe (S7-T01, ADR-0040), réservé aux administrateurs (choix du 2026-10-17).
 *
 * Chaque action se fait dans la transaction des commandes : commande verrouillée d'abord, puis l'expédition ; le
 * statut de la commande, l'expédition, son historique et la ligne du journal d'audit sont écrits ensemble ou pas du
 * tout. Répéter la même action ne change rien (`changed: false`) : un double clic ne fait pas deux tentatives.
 */
@Injectable()
export class ShipmentService {
  /** Horloge (remplaçable dans les tests). */
  clock: () => Date = () => new Date();

  constructor(
    private readonly orders: OrderShipping,
    @Inject(SHIPMENT_REPOSITORY) private readonly shipments: ShipmentRepository,
    @Inject(CARRIER) private readonly carrier: Carrier,
    @Inject(SHIPPING_RANDOM) private readonly random: ShippingRandom,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, "record">,
  ) {}

  /** Commandes prêtes à remettre au transporteur (payées ou à la livraison, tous les vendeurs d'accord). */
  listReady(): Promise<OrderRecord[]> {
    return this.orders.listReady(SHIPPING_RULES.listMax);
  }

  list(status: ShipmentStatus): Promise<ShipmentRecord[]> {
    return this.shipments.list(status, SHIPPING_RULES.listMax);
  }

  async get(reference: string): Promise<ShipmentRecord> {
    const shipment = await this.shipments.findByReference(reference);
    if (!shipment) throw notFound();
    return shipment;
  }

  /** Remise au transporteur : la commande passe « expédiée », l'expédition naît « en route » avec ses parts (BR-021). */
  handOver(adminId: string, reference: string, context: AuditContext): Promise<ShipmentResult> {
    return this.orders.transaction(async () => {
      const order = await this.orders.lock(reference);
      const existing = await this.shipments.findByReference(order.reference, true);
      if (existing) return { shipment: existing, changed: false };
      const now = this.clock();
      await this.orders.markShipped(order, now);
      const shipment = await this.shipments.create(
        {
          id: this.random.uuid(),
          orderId: order.id,
          orderReference: order.reference,
          carrier: this.carrier.name,
          cityName: order.delivery.cityName,
          deliveryFee: order.deliveryFee,
          ...deliveryShares(order.deliveryFee),
          handedOverAt: now,
          updatedAt: now,
        },
        { id: this.random.uuid(), status: "in_transit", at: now, note: null, actorId: adminId },
      );
      await this.carrier.handOver({ orderReference: order.reference, cityName: shipment.cityName });
      await this.record("shipment.handed_over", adminId, order, context, { attempt: 1 });
      return { shipment, changed: true };
    });
  }

  /** Commande livrée (BR-010 : plus jamais annulable). */
  delivered(adminId: string, reference: string, context: AuditContext): Promise<ShipmentResult> {
    return this.move(adminId, reference, "delivered", context, async (order, shipment, now) => {
      await this.orders.markDelivered(order, now);
      return { attempt: shipment.attempt, failureReason: null, note: null };
    });
  }

  /** Livraison impossible (client absent, adresse fausse…) : la commande reste « expédiée » en attendant la suite. */
  failed(
    adminId: string,
    reference: string,
    rawReason: string,
    context: AuditContext,
  ): Promise<ShipmentResult> {
    const reason = cleanText(rawReason, "motif");
    return this.move(adminId, reference, "failed", context, (_order, shipment) =>
      Promise.resolve({ attempt: shipment.attempt, failureReason: reason, note: reason }),
    );
  }

  /** Nouvelle tentative après un échec : l'expédition repart « en route ». */
  retry(adminId: string, reference: string, context: AuditContext): Promise<ShipmentResult> {
    return this.move(adminId, reference, "in_transit", context, (_order, shipment) => {
      if (shipment.attempt >= SHIPPING_RULES.maxAttempts) {
        throw new ShippingError(
          "STATUT_EXPEDITION_INCOMPATIBLE",
          `${SHIPPING_RULES.maxAttempts} tentatives au plus : annulez la commande`,
        );
      }
      return Promise.resolve({ attempt: shipment.attempt + 1, failureReason: null, note: null });
    });
  }

  /**
   * Livraison impossible pour de bon : la commande est annulée (stock rendu, coupon rendu, remboursement « à faire »
   * et avoir par le module payments). Seulement après un échec noté.
   */
  cancel(
    adminId: string,
    reference: string,
    rawNote: string,
    context: AuditContext,
  ): Promise<ShipmentResult> {
    const note = cleanText(rawNote, "note");
    return this.move(adminId, reference, "cancelled", context, async (order, shipment, now) => {
      await this.orders.cancelAfterFailedDelivery(order, now);
      return { attempt: shipment.attempt, failureReason: shipment.failureReason, note };
    });
  }

  private move(
    adminId: string,
    reference: string,
    to: ShipmentStatus,
    context: AuditContext,
    apply: (
      order: OrderRecord,
      shipment: ShipmentRecord,
      now: Date,
    ) => Promise<{ attempt: number; failureReason: string | null; note: string | null }>,
  ): Promise<ShipmentResult> {
    return this.orders.transaction(async () => {
      const order = await this.orders.lock(reference);
      const shipment = await this.shipments.findByReference(order.reference, true);
      if (!shipment) throw notFound();
      // Déjà fait (double clic, onglet resté ouvert) : rien ne change. Une nouvelle tentative, elle, se demande toujours
      // depuis un échec.
      if (shipment.status === to && to !== "in_transit") return { shipment, changed: false };
      if (!canMove(shipment.status, to)) {
        throw new ShippingError(
          "STATUT_EXPEDITION_INCOMPATIBLE",
          `action impossible : cette expédition est ${STATUS_TEXT[shipment.status]}`,
        );
      }
      const now = this.clock();
      const { attempt, failureReason, note } = await apply(order, shipment, now);
      const updated = await this.shipments.update(
        shipment.id,
        { status: to, attempt, failureReason },
        { id: this.random.uuid(), status: to, at: now, note, actorId: adminId },
      );
      const action = AUDIT_ACTION[to];
      // Journal : 100 caractères au plus par valeur (le texte entier reste dans l'historique de l'expédition) —
      // relecture de sécurité du S7-T01 : sinon un motif de 101 à 200 caractères bloquait l'étape (erreur 500)
      const details: Record<string, string | number> =
        to === "in_transit" ? { attempt } : note ? { note: note.slice(0, AUDIT_TEXT_MAX) } : {};
      await this.record(action, adminId, order, context, details);
      return { shipment: updated, changed: true };
    });
  }

  private record(
    action:
      | "shipment.handed_over"
      | "shipment.delivered"
      | "shipment.failed"
      | "shipment.retried"
      | "shipment.cancelled",
    adminId: string,
    order: OrderRecord,
    context: AuditContext,
    details: Record<string, string | number>,
  ): Promise<void> {
    return this.audit.record({
      action,
      actor: { type: "account", id: adminId },
      target: { type: "order", id: order.id },
      details: { reference: order.reference, ...details },
      context,
    });
  }
}

/** Longueur maximale d'une valeur du journal d'audit (`audit/domain/audit-event.ts`). */
const AUDIT_TEXT_MAX = 100;

const AUDIT_ACTION = {
  in_transit: "shipment.retried",
  delivered: "shipment.delivered",
  failed: "shipment.failed",
  cancelled: "shipment.cancelled",
} as const;

const STATUS_TEXT: Record<ShipmentStatus, string> = {
  in_transit: "en route",
  delivered: "déjà livrée",
  failed: "en échec",
  cancelled: "annulée",
};

function notFound(): ShippingError {
  return new ShippingError("EXPEDITION_INTROUVABLE", "aucune expédition pour cette commande");
}
