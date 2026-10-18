import type { CustomerShipment, DeliveryTariffs, ReadyOrder, Shipment } from "@kemdia/contracts";
import { ZONES } from "@kemdia/contracts/delivery";
import type { OrderRecord } from "../../orders/index.js";
import type { ShipmentRecord, TariffRecord } from "../application/ports.js";

/** Expédition vue par l'administration ; l'auteur de chaque étape reste au journal d'audit. */
export function presentShipment(s: ShipmentRecord): Shipment {
  return {
    reference: s.orderReference,
    status: s.status,
    carrier: s.carrier,
    attempt: s.attempt,
    cityName: s.cityName,
    deliveryFee: s.deliveryFee,
    kemdiaShare: s.kemdiaShare,
    carrierShare: s.carrierShare,
    failureReason: s.failureReason,
    handedOverAt: s.handedOverAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    events: s.events.map((e) => ({ status: e.status, at: e.at.toISOString(), note: e.note })),
  };
}

/** Vue du client (S7-T02) : ni motif, ni transporteur, ni parts des frais. */
export function presentCustomerShipment(s: ShipmentRecord): CustomerShipment {
  return {
    reference: s.orderReference,
    status: s.status,
    attempt: s.attempt,
    handedOverAt: s.handedOverAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    events: s.events.map((e) => ({ status: e.status, at: e.at.toISOString() })),
  };
}

/** Commande prête : ni le nom, ni le téléphone, ni l'adresse du client (ils sont sur la commande elle-même). */
export function presentReady(o: OrderRecord): ReadyOrder {
  return {
    reference: o.reference,
    status: o.status,
    paymentMethod: o.paymentMethod,
    paid: o.paidAt !== null,
    total: o.total,
    deliveryFee: o.deliveryFee,
    cityName: o.delivery.cityName,
    itemCount: o.lines.reduce((n, l) => n + l.quantity, 0),
    createdAt: o.createdAt.toISOString(),
  };
}

export function presentTariffs(t: TariffRecord): DeliveryTariffs {
  return {
    zones: t.zones.map((z) => ({ ...z, label: ZONES[z.id].label })),
    updatedAt: t.updatedAt?.toISOString() ?? null,
  };
}
