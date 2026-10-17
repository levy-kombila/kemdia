import { ShippingError } from "./shipping-error.js";

/**
 * Expéditions et barème de livraison (S7-T01, ADR-0040) — TypeScript pur.
 *
 * Une expédition naît quand un administrateur remet la commande au transporteur (« en route ») ; ensuite livrée, ou
 * échec de livraison → nouvelle tentative (en route) ou annulation de la commande (choix du 2026-10-17).
 */
export const SHIPMENT_STATUSES = ["in_transit", "delivered", "failed", "cancelled"] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

/** Transporteur tant qu'aucun n'est choisi (question ouverte n° 5) : l'équipe suit les livraisons à la main. */
export const MANUAL_CARRIER = "manuel";

export const SHIPPING_RULES = {
  /** BR-021 : part de Kemdia sur les frais de livraison facturés */
  kemdiaSharePercent: 15,
  reasonMin: 3,
  reasonMax: 200,
  baseFeeMax: 100_000,
  freeThresholdMax: 10_000_000,
  daysMax: 30,
  listMax: 100,
  /** Tentatives de livraison au plus (règle SQL aussi) : au-delà, une erreur de saisie plutôt qu'un vrai essai */
  maxAttempts: 20,
} as const;

const NEXT: Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>> = {
  in_transit: ["delivered", "failed"],
  failed: ["in_transit", "cancelled"],
  delivered: [],
  cancelled: [],
};

export function canMove(from: ShipmentStatus, to: ShipmentStatus): boolean {
  return NEXT[from].includes(to);
}

/**
 * Parts des frais de livraison (BR-021) : Kemdia 15 % arrondis à l'entier INFÉRIEUR (choix du 2026-10-17 : jamais plus
 * de 15 %), le transporteur le reste. Livraison offerte : rien n'est facturé, rien n'est partagé.
 */
export function deliveryShares(fee: number): { kemdiaShare: number; carrierShare: number } {
  if (!Number.isSafeInteger(fee) || fee < 0) throw new RangeError("frais de livraison invalides");
  const kemdiaShare = Math.floor((fee * SHIPPING_RULES.kemdiaSharePercent) / 100);
  return { kemdiaShare, carrierShare: fee - kemdiaShare };
}

/**
 * Motif d'un échec ou note d'une annulation : sans caractères de contrôle ni invisibles (journal et écrans lisibles),
 * espaces resserrés, 3 à 200 caractères.
 */
export function cleanText(raw: string, field: string): string {
  const text = raw
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length < SHIPPING_RULES.reasonMin || text.length > SHIPPING_RULES.reasonMax) {
    throw new ShippingError(
      "EXPEDITION_INVALIDE",
      `${field} : ${SHIPPING_RULES.reasonMin} à ${SHIPPING_RULES.reasonMax} caractères`,
    );
  }
  return text;
}

export const ZONE_IDS = ["zone_1", "zone_2", "zone_3", "zone_4"] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export interface ZoneTariff {
  id: ZoneId;
  baseFee: number;
  freeThreshold: number;
  daysMin: number;
  daysMax: number;
}

const intIn = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;

/** Barème envoyé par un administrateur : les 4 zones une fois chacune, dans les bornes ; rendu dans l'ordre des zones. */
export function validateTariffs(input: readonly ZoneTariff[]): ZoneTariff[] {
  const byId = new Map(input.map((z) => [z.id, z]));
  if (input.length !== ZONE_IDS.length || byId.size !== ZONE_IDS.length) {
    throw new ShippingError("TARIFS_INVALIDES", "barème : les 4 zones, une fois chacune");
  }
  return ZONE_IDS.map((id) => {
    const zone = byId.get(id);
    if (!zone) throw new ShippingError("TARIFS_INVALIDES", `barème : zone ${id} manquante`);
    if (!intIn(zone.baseFee, SHIPPING_RULES.baseFeeMax)) {
      throw new ShippingError(
        "TARIFS_INVALIDES",
        `${id} : frais de base entre 0 et ${SHIPPING_RULES.baseFeeMax} FCFA`,
      );
    }
    if (!intIn(zone.freeThreshold, SHIPPING_RULES.freeThresholdMax)) {
      throw new ShippingError(
        "TARIFS_INVALIDES",
        `${id} : seuil de livraison offerte entre 0 et ${SHIPPING_RULES.freeThresholdMax} FCFA`,
      );
    }
    if (
      !intIn(zone.daysMin, SHIPPING_RULES.daysMax) ||
      !intIn(zone.daysMax, SHIPPING_RULES.daysMax) ||
      zone.daysMin > zone.daysMax
    ) {
      throw new ShippingError(
        "TARIFS_INVALIDES",
        `${id} : délais de 0 à ${SHIPPING_RULES.daysMax} jours, minimum ≤ maximum`,
      );
    }
    return {
      id,
      baseFee: zone.baseFee,
      freeThreshold: zone.freeThreshold,
      daysMin: zone.daysMin,
      daysMax: zone.daysMax,
    };
  });
}
