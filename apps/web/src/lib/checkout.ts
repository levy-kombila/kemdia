/**
 * Règles du tunnel de commande (S2-T02) — logique pure, testée.
 * Côté navigateur, ces contrôles servent au confort. Le serveur (Sprint 5, module orders) refera tout :
 * prix relus en base (BR-004), stock réservé dans la même transaction (BR-012), zones du paiement à la livraison (BR-011).
 */
import { normalizeGabonPhone, normalizeName, type MobileOperator } from "./auth/validation";
import type { CartLine } from "./cart";
import { LANDMARK_MAX, LANDMARK_MIN, OTHER_NEIGHBORHOOD } from "@kemdia/contracts/delivery";
import { getCity } from "./delivery";

export type PaymentMethod = "airtel" | "moov" | "cod";

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; operator?: MobileOperator }> =
  {
    airtel: { label: "Airtel Money", operator: "Airtel" },
    moov: { label: "Moov Money", operator: "Moov" },
    cod: { label: "Paiement à la livraison" },
  };

export { COD_MAX_TOTAL, COD_ZONES, codAvailability } from "@kemdia/contracts/delivery";

export type Address = {
  fullName: string;
  phone: string;
  cityId: string;
  neighborhood: string;
  /** Point de repère : au Gabon, on se repère plus souvent ainsi que par numéro de rue */
  landmark: string;
};

export type AddressErrors = Partial<Record<keyof Address, string>>;

export { LANDMARK_MAX, OTHER_NEIGHBORHOOD };

export function validateAddress(a: Address): AddressErrors {
  const e: AddressErrors = {};
  const name = a.fullName.trim().replace(/\s+/g, " ");
  if (name.split(" ").length < 2 || !name.split(" ").every((part) => normalizeName(part)))
    e.fullName = "Prénom et nom (ex. Marie Nze).";
  if (!normalizeGabonPhone(a.phone)) e.phone = "Numéro gabonais à 9 chiffres, ex. 077 12 34 56.";
  const city = getCity(a.cityId);
  if (!city) e.cityId = "Choisissez votre ville.";
  else if (
    city.neighborhoods.length > 0 &&
    a.neighborhood !== OTHER_NEIGHBORHOOD &&
    !city.neighborhoods.includes(a.neighborhood)
  )
    e.neighborhood = "Choisissez votre quartier.";
  const landmark = a.landmark.trim();
  if (landmark.length < LANDMARK_MIN)
    e.landmark = "Indiquez un repère pour le livreur (ex. « face à la pharmacie »).";
  else if (landmark.length > LANDMARK_MAX) e.landmark = `${LANDMARK_MAX} caractères maximum.`;
  return e;
}

/** Le numéro qui paie doit appartenir à l'opérateur choisi (06 = Moov, 07 = Airtel). */
export function validatePaymentPhone(method: PaymentMethod, phone: string): string | null {
  if (method === "cod") return null;
  const parsed = normalizeGabonPhone(phone);
  if (!parsed) return "Numéro gabonais à 9 chiffres, ex. 077 12 34 56.";
  const expected = PAYMENT_METHODS[method].operator;
  if (parsed.operator !== expected)
    return `Ce numéro n'est pas un numéro ${expected} (${expected === "Airtel" ? "07…" : "06…"}).`;
  return null;
}

export type OrderRequest = {
  /** Lignes de commande : la variante choisie et sa quantité, rien d'autre (S3-T05) */
  items: { variantId: string; quantity: number }[];
  delivery: {
    fullName: string;
    phone: string;
    cityId: string;
    neighborhood: string;
    landmark: string;
  };
  payment: { method: PaymentMethod; phone?: string };
};

/**
 * Ce qui partira vers le serveur : identifiants et quantités SEULEMENT.
 * Aucun prix, aucun total, aucun frais : le serveur les recalcule (leçon CRIT-01 de l'ancien site).
 */
export function buildOrderRequest(
  lines: CartLine[],
  address: Address,
  method: PaymentMethod,
  paymentPhone: string,
): OrderRequest {
  const phone = normalizeGabonPhone(address.phone)?.value ?? "";
  return {
    items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
    delivery: {
      fullName: address.fullName.trim().replace(/\s+/g, " "),
      phone,
      cityId: address.cityId,
      neighborhood: address.neighborhood,
      landmark: address.landmark.trim().slice(0, LANDMARK_MAX),
    },
    payment:
      method === "cod"
        ? { method }
        : { method, phone: normalizeGabonPhone(paymentPhone)?.value ?? "" },
  };
}
