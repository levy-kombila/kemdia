import type { ShipmentStatus, ZoneTariff } from "../domain/shipment.js";

export const SHIPMENT_REPOSITORY = Symbol("SHIPMENT_REPOSITORY");
export const TARIFF_REPOSITORY = Symbol("TARIFF_REPOSITORY");
export const CARRIER = Symbol("CARRIER");
export const SHIPPING_TRANSACTION = Symbol("SHIPPING_TRANSACTION");
export const SHIPPING_RANDOM = Symbol("SHIPPING_RANDOM");

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
