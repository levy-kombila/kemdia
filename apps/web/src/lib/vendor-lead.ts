/**
 * Demande d'ouverture de boutique (S2-T06) — validation pure, testée.
 * S6 : envoyée au module `vendors` de l'API (avec limitation de débit et protection anti-robots).
 */
import { normalizeGabonPhone, normalizeName } from "./auth/validation";
import { getCity } from "./delivery";

export type VendorLead = {
  fullName: string;
  shopName: string;
  phone: string;
  cityId: string;
  category: string;
  message: string;
};

export const VENDOR_CATEGORIES = [
  "High-Tech",
  "Mode",
  "Maison & Cuisine",
  "Beauté & Santé",
  "Sport & Loisirs",
  "Autre",
] as const;
export const SHOP_NAME_MAX = 60;
export const LEAD_MESSAGE_MAX = 500;

export function validateVendorLead(l: VendorLead): Partial<Record<keyof VendorLead, string>> {
  const e: Partial<Record<keyof VendorLead, string>> = {};
  const parts = l.fullName.trim().split(/\s+/);
  if (parts.length < 2 || !parts.every((p) => normalizeName(p)))
    e.fullName = "Prénom et nom (ex. Paul Ondo).";
  const shop = l.shopName.trim();
  if (shop.length < 2 || shop.length > SHOP_NAME_MAX || /[<>]/.test(shop))
    e.shopName = `Nom de boutique de 2 à ${SHOP_NAME_MAX} caractères.`;
  if (!normalizeGabonPhone(l.phone)) e.phone = "Numéro gabonais à 9 chiffres, ex. 077 12 34 56.";
  if (!getCity(l.cityId)) e.cityId = "Choisissez votre ville.";
  if (!(VENDOR_CATEGORIES as readonly string[]).includes(l.category))
    e.category = "Choisissez ce que vous vendez.";
  if (l.message.length > LEAD_MESSAGE_MAX) e.message = `${LEAD_MESSAGE_MAX} caractères maximum.`;
  return e;
}
