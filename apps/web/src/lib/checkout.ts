/**
 * Règles du tunnel de commande (S2-T02) — logique pure, testée.
 * Côté navigateur, ces contrôles servent au confort. Le serveur (Sprint 5, module orders) refera tout :
 * prix relus en base (BR-004), stock réservé dans la même transaction (BR-012), zones du paiement à la livraison (BR-011).
 */
import { normalizeGabonPhone, normalizeName, type MobileOperator } from "./auth/validation";
import type { CartLine } from "./cart";
import { getCity, type ZoneId } from "./delivery";

export type PaymentMethod = "airtel" | "moov" | "cod";

export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; operator?: MobileOperator }> =
  {
    airtel: { label: "Airtel Money", operator: "Airtel" },
    moov: { label: "Moov Money", operator: "Moov" },
    cod: { label: "Paiement à la livraison" },
  };

/**
 * Paiement à la livraison (BR-011). Valeurs PROVISOIRES : question ouverte n° 1 de regles-metier.md.
 * Proposition : Grand Libreville uniquement, panier jusqu'à 100 000 FCFA.
 */
export const COD_ZONES: ZoneId[] = ["zone_1"];
export const COD_MAX_TOTAL = 100_000;

export function codAvailability(
  cityId: string,
  total: number,
): { allowed: true } | { allowed: false; reason: string } {
  const city = getCity(cityId);
  if (!city || !COD_ZONES.includes(city.zone))
    return {
      allowed: false,
      reason: "Disponible uniquement dans le Grand Libreville pour le moment.",
    };
  if (total > COD_MAX_TOTAL)
    return { allowed: false, reason: "Disponible pour les commandes jusqu'à 100 000 FCFA." };
  return { allowed: true };
}

export type Address = {
  fullName: string;
  phone: string;
  cityId: string;
  neighborhood: string;
  /** Point de repère : au Gabon, on se repère plus souvent ainsi que par numéro de rue */
  landmark: string;
};

export type AddressErrors = Partial<Record<keyof Address, string>>;

export const LANDMARK_MAX = 200;
/** Quartier absent de la liste : la personne le précise dans le repère. */
export const OTHER_NEIGHBORHOOD = "Autre quartier";

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
  if (landmark.length < 5)
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
  items: { productId: string; quantity: number }[];
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
    items: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
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
