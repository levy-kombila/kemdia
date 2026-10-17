import { normalizeGabonPhone } from "./gabon-phone.js";
import { OrdersError } from "./orders-error.js";

/**
 * Commande (S5-T02, ADR-0024) — TypeScript pur.
 *
 * En attente de paiement (Mobile Money) → confirmée → en préparation → expédiée → livrée ; annulée.
 * Le paiement à la livraison est confirmé tout de suite (rien à attendre en ligne).
 */
export const ORDER_STATUSES = [
  "pending_payment",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ["airtel", "moov", "cod"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export type CancelReason =
  "client" | "paiement_expire" | "admin" | "vendeur_refus" | "vendeur_delai";

/** Délai pour payer par Mobile Money (choix du 2026-10-10) ; ensuite annulée, stock remis en vente. */
export const PAYMENT_WINDOW_MS = 30 * 60_000;

/** Changements de statut permis. BR-010 : une commande livrée n'est plus annulable. */
const NEXT: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pending_payment: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT[from].includes(to);
}

/**
 * Le client annule lui-même tant que la commande n'est pas expédiée (choix du 2026-10-10).
 * Exception (relecture de sécurité du S5-T02, puis du S5-T04) : une commande déjà PAYÉE (Mobile Money confirmé, ou
 * espèces encaissées) demande un remboursement → service client (annulation par un administrateur).
 */
export function clientCanCancel(
  status: OrderStatus,
  method: PaymentMethod,
  paid: boolean,
): boolean {
  if (paid) return false;
  if (status === "pending_payment") return true;
  if (status === "confirmed" || status === "preparing") return method === "cod";
  return false;
}

/**
 * Un administrateur (service client, S5-T04) annule toute commande pas encore expédiée, même payée : le remboursement
 * est alors noté « à faire » par le module payments.
 */
export function adminCanCancel(status: OrderStatus): boolean {
  return status === "pending_payment" || status === "confirmed" || status === "preparing";
}

/** Statuts d'une commande « ouverte » : elle bloque encore du stock. */
export const OPEN_STATUSES: readonly OrderStatus[] = ["pending_payment", "confirmed", "preparing"];
/**
 * Commandes ouvertes au plus par compte (`MAX_OPEN_ORDERS` du contrat) : un compte ne peut pas bloquer le stock avec
 * des commandes jamais payées ou des paiements à la livraison fantaisistes (relecture de sécurité du S5-T02).
 */
export const MAX_OPEN_ORDERS = 3;

/** Statut de départ et échéance de paiement. */
export function initialState(
  method: PaymentMethod,
  now: Date,
): { status: OrderStatus; paymentDueAt: Date | null } {
  return method === "cod"
    ? { status: "confirmed", paymentDueAt: null }
    : { status: "pending_payment", paymentDueAt: new Date(now.getTime() + PAYMENT_WINDOW_MS) };
}

// --- Numéro de commande ---

export const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const REFERENCE_PATTERN = /^KMD-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

/**
 * « KMD-7F3K9Q » : 6 caractères tirés au hasard (32 symboles : un octet & 31 est exactement uniforme).
 * BR-042 : jamais des numéros qui se suivent ; un milliard de possibilités.
 */
export function newReference(randomBytes: (size: number) => Uint8Array): string {
  const bytes = randomBytes(6);
  let code = "";
  for (const byte of bytes) code += REFERENCE_ALPHABET[byte & 31];
  return `KMD-${code}`;
}

// --- Paiement ---

export interface PaymentChoice {
  method: PaymentMethod;
  /** Numéro Mobile Money (+241…), vide pour le paiement à la livraison */
  phone: string | null;
}

/** Le numéro qui paie doit appartenir à l'opérateur choisi : 07… Airtel Money, 06… Moov Money. */
export function validatePayment(method: PaymentMethod, phone: string | undefined): PaymentChoice {
  if (method === "cod") return { method, phone: null };
  const parsed = phone ? normalizeGabonPhone(phone) : null;
  const expected = method === "airtel" ? "Airtel" : "Moov";
  if (!parsed || parsed.operator !== expected) {
    throw new OrdersError(
      "NUMERO_PAIEMENT_INVALIDE",
      `numéro ${expected} Money attendu (${expected === "Airtel" ? "07…" : "06…"})`,
    );
  }
  return { method, phone: parsed.value };
}

// --- Montants ---

export interface ReservedLine {
  variantId: string;
  productId: string;
  /** Boutique qui vend le produit, figée au moment de la commande (S6-T07) */
  shopId: string;
  title: string;
  variantName: string;
  image: string | null;
  unitPrice: number;
  quantity: number;
}

export interface PricedLine extends ReservedLine {
  lineTotal: number;
}

/** Montants de la commande, calculés ici à partir des prix lus sur les variantes verrouillées (BR-004). */
export function priceLines(lines: readonly ReservedLine[]): {
  lines: PricedLine[];
  subtotal: number;
} {
  if (lines.length === 0) throw new OrdersError("PANIER_VIDE", "votre panier est vide");
  const priced = lines.map((l) => {
    if (!Number.isSafeInteger(l.unitPrice) || l.unitPrice <= 0) {
      throw new RangeError("prix unitaire : entier positif");
    }
    return { ...l, lineTotal: l.unitPrice * l.quantity };
  });
  const subtotal = priced.reduce((sum, l) => sum + l.lineTotal, 0);
  if (!Number.isSafeInteger(subtotal)) throw new RangeError("total hors limites");
  return { lines: priced, subtotal };
}
