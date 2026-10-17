import type { OrderStatus } from "./order.js";
import { OrdersError } from "./orders-error.js";

/**
 * Parts d'une commande par boutique (S6-T07, ADR-0038 ; BR-013) — TypeScript pur.
 *
 * Chaque boutique d'une commande en a une part. La part de la boutique Kemdia est acceptée d'office. Une part de vendeur
 * s'OUVRE quand la commande est confirmée (payée, ou paiement à la livraison) : le vendeur la voit et a 24 h pour
 * l'accepter ou la refuser. Un refus, ou l'absence de réponse, annule la commande ENTIÈRE (choix du 2026-10-17). Quand
 * toutes les parts de vendeurs sont acceptées, la commande passe « en préparation ».
 */
export const SHOP_PART_STATUSES = ["pending", "accepted", "refused", "expired"] as const;
export type ShopPartStatus = (typeof SHOP_PART_STATUSES)[number];

// Mêmes valeurs que le contrat (VENDOR_ORDER_RESPONSE_HOURS, VENDOR_ORDER_REFUSAL_LIMITS, KEMDIA_SHOP_ID) et la migration
// SQL : vérifié par test/orders-alignment.test.ts (le domaine n'importe rien).

/** Délai de réponse du vendeur, en heures (choix du 2026-10-17). */
export const VENDOR_RESPONSE_HOURS = 24;
export const VENDOR_RESPONSE_MS = VENDOR_RESPONSE_HOURS * 3_600_000;
/** Motif d'un refus : longueur en caractères, espaces retirés. */
export const REFUSAL_REASON_LIMITS = { min: 5, max: 300 } as const;
/** Boutique Kemdia (« kemdia » en hexadécimal) : sa part est acceptée d'office. */
export const KEMDIA_SHOP = "6b656d64-6961-4000-8000-000000000001";

export const isKemdiaShop = (shopId: string) => shopId === KEMDIA_SHOP;

export interface ShopPart {
  shopId: string;
  status: ShopPartStatus;
  subtotal: number;
  itemCount: number;
  openedAt: Date | null;
  dueAt: Date | null;
  decidedAt: Date | null;
  refusalReason: string | null;
}

/** Part à créer avec la commande. */
export type NewShopPart = Pick<ShopPart, "shopId" | "status" | "subtotal" | "itemCount">;

/** Une part par boutique, dans l'ordre d'apparition des articles ; la part Kemdia est acceptée d'office. */
export function splitByShop(
  lines: readonly { shopId: string; lineTotal: number; quantity: number }[],
): NewShopPart[] {
  const parts = new Map<string, NewShopPart>();
  for (const line of lines) {
    const part = parts.get(line.shopId) ?? {
      shopId: line.shopId,
      status: isKemdiaShop(line.shopId) ? ("accepted" as const) : ("pending" as const),
      subtotal: 0,
      itemCount: 0,
    };
    part.subtotal += line.lineTotal;
    part.itemCount += line.quantity;
    parts.set(line.shopId, part);
  }
  return [...parts.values()];
}

/** Ouverture d'une part de vendeur : maintenant, avec son échéance. */
export function openingOf(now: Date): { openedAt: Date; dueAt: Date } {
  return { openedAt: now, dueAt: new Date(now.getTime() + VENDOR_RESPONSE_MS) };
}

/**
 * Le vendeur peut-il encore décider ? Part en attente et ouverte, commande toujours confirmée (ni annulée, ni déjà
 * plus loin), échéance pas encore passée.
 */
export function canDecide(part: ShopPart, orderStatus: OrderStatus, now: Date): boolean {
  return (
    part.status === "pending" &&
    orderStatus === "confirmed" &&
    part.dueAt !== null &&
    part.dueAt.getTime() > now.getTime()
  );
}

/** Toutes les parts sont acceptées : la commande peut passer « en préparation ». */
export function allAccepted(parts: readonly Pick<ShopPart, "status">[]): boolean {
  return parts.length > 0 && parts.every((p) => p.status === "accepted");
}

/**
 * La commande contient au moins une part de vendeur : sans elle, rien ne change par rapport au S5 (une commande de la
 * boutique Kemdia seule reste « confirmée » jusqu'à son traitement par l'équipe).
 */
export function hasVendorPart(parts: readonly Pick<ShopPart, "shopId">[]): boolean {
  return parts.some((p) => !isKemdiaShop(p.shopId));
}

/**
 * Motif d'un refus : espaces et caractères invisibles ou de contrôle retirés, de 5 à 300 caractères. Il reste chez
 * Kemdia (jamais montré au client).
 */
export function refusalReasonOf(raw: string): string {
  const reason = raw
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const length = [...reason].length;
  if (length < REFUSAL_REASON_LIMITS.min || length > REFUSAL_REASON_LIMITS.max) {
    throw new OrdersError(
      "MOTIF_REFUS_INVALIDE",
      `motif : ${REFUSAL_REASON_LIMITS.min} à ${REFUSAL_REASON_LIMITS.max} caractères`,
    );
  }
  return reason;
}

/** Où en est la commande pour le vendeur (contrat `VendorOrderStatus`). */
export type VendorView = "pending" | "accepted" | "refused" | "expired" | "cancelled";

export function vendorViewOf(part: Pick<ShopPart, "status">, orderStatus: OrderStatus): VendorView {
  if (part.status === "refused" || part.status === "expired") return part.status;
  if (orderStatus === "cancelled") return "cancelled";
  return part.status;
}
