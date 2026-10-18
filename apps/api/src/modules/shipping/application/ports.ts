import type { ShipmentStatus, ZoneTariff } from "../domain/shipment.js";

export const SHIPMENT_REPOSITORY = Symbol("SHIPMENT_REPOSITORY");
export const TARIFF_REPOSITORY = Symbol("TARIFF_REPOSITORY");
export const CARRIER = Symbol("CARRIER");
export const SHIPPING_TRANSACTION = Symbol("SHIPPING_TRANSACTION");
export const SHIPPING_RANDOM = Symbol("SHIPPING_RANDOM");
export const SHIPMENT_EMAILS = Symbol("SHIPMENT_EMAILS");
export const SHIPMENT_MAILER = Symbol("SHIPMENT_MAILER");

export interface ShipmentEventRecord {
  status: ShipmentStatus;
  at: Date;
  note: string | null;
  actorId: string;
}

export interface ShipmentRecord {
  id: string;
  orderId: string;
  orderReference: string;
  status: ShipmentStatus;
  carrier: string;
  attempt: number;
  cityName: string;
  deliveryFee: number;
  kemdiaShare: number;
  carrierShare: number;
  failureReason: string | null;
  handedOverAt: Date;
  updatedAt: Date;
  events: ShipmentEventRecord[];
}

export type NewShipment = Omit<ShipmentRecord, "events" | "status" | "attempt" | "failureReason">;

export interface ShipmentChange {
  status: ShipmentStatus;
  attempt: number;
  failureReason: string | null;
}

export interface ShipmentRepository {
  /** `lock` : la ligne est verrouillée jusqu'à la fin de la transaction (après la commande). */
  findByReference(reference: string, lock?: boolean): Promise<ShipmentRecord | null>;
  create(
    shipment: NewShipment,
    event: ShipmentEventRecord & { id: string },
  ): Promise<ShipmentRecord>;
  update(
    id: string,
    change: ShipmentChange,
    event: ShipmentEventRecord & { id: string },
  ): Promise<ShipmentRecord>;
  /** Les plus récemment changées d'abord. */
  list(status: ShipmentStatus, limit: number): Promise<ShipmentRecord[]>;
}

export interface TariffRecord {
  zones: ZoneTariff[];
  updatedAt: Date | null;
}

export interface TariffRepository {
  /** Barème en vigueur, dans la transaction en cours s'il y en a une ; zones manquantes = valeurs du contrat. */
  get(): Promise<TariffRecord>;
  save(zones: readonly ZoneTariff[], adminId: string, now: Date): Promise<TariffRecord>;
}

/**
 * Transporteur (question ouverte n° 5). Aujourd'hui l'adaptateur « manuel » : l'équipe prévient le livreur elle-même.
 * Un vrai transporteur (API, fichier) se branchera ici sans changer le reste du module.
 */
export interface Carrier {
  readonly name: string;
  /** Appelé dans la transaction de la remise : une erreur annule tout (la commande reste prête). */
  handOver(shipment: { orderReference: string; cityName: string }): Promise<void>;
}

export interface ShippingTransaction {
  run<T>(work: () => Promise<T>): Promise<T>;
}

export interface ShippingRandom {
  uuid(): string;
}

/** E-mail au client (S7-T02) : remise au transporteur, livraison. */
export type ShipmentEmailKind = "handed_over" | "delivered";

export interface ShipmentEmailRecord {
  id: string;
  kind: ShipmentEmailKind;
  accountId: string;
  orderReference: string;
  attempts: number;
  /** État ACTUEL de l'expédition et sa ville (lus avec l'e-mail) */
  shipmentStatus: ShipmentStatus;
  cityName: string;
}

export interface ShipmentEmailOutbox {
  /** Dans la transaction de l'étape ; une seconde fois pour la même étape : ignorée. */
  enqueue(email: {
    id: string;
    shipmentId: string;
    kind: ShipmentEmailKind;
    accountId: string;
    orderReference: string;
    now: Date;
  }): Promise<void>;
  due(now: Date, limit: number): Promise<ShipmentEmailRecord[]>;
  /** Réserve l'envoi (conditionnel) : `false` si une autre instance l'a pris. */
  claim(id: string, now: Date, nextAt: Date): Promise<boolean>;
  markSent(id: string, now: Date): Promise<void>;
  giveUp(id: string): Promise<void>;
}

export interface ShipmentNotice {
  firstName: string;
  reference: string;
  cityName: string;
}

export interface ShipmentMailer {
  readonly available: boolean;
  send(to: string, kind: ShipmentEmailKind, notice: ShipmentNotice): Promise<void>;
}
