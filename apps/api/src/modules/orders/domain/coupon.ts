import { OrdersError } from "./orders-error.js";

/**
 * Coupons de réduction (S5-T03, ADR-0025) — TypeScript pur.
 *
 * - Pourcentage (plafond en FCFA possible) ou montant fixe, **sur les articles seulement** (jamais la livraison).
 * - Par défaut, pas sur les articles déjà en promotion (prix barré) : BR-031, réglable coupon par coupon.
 * - Un seul coupon par commande. Expiré, pas encore valable, épuisé ou déjà utilisé par ce compte : refusé (BR-030).
 */
export const COUPON_KINDS = ["percent", "fixed"] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

export const COUPON_PERCENT_MAX = 90;
export const COUPON_FIXED_MAX = 10_000_000;
/** Bornes des réglages (`COUPON_LIMITS` du contrat) : au-delà, erreur de saisie probable (et colonnes INTEGER). */
export const COUPON_LIMITS = {
  fixedMax: COUPON_FIXED_MAX,
  maxDiscountMax: 10_000_000,
  minSubtotalMax: 100_000_000,
  usageLimitMax: 1_000_000,
  perAccountLimitMax: 1_000,
} as const;
export const COUPON_CODE = /^[A-Z0-9][A-Z0-9-]{2,18}[A-Z0-9]$/;

export interface CouponRules {
  code: string;
  kind: CouponKind;
  /** Pourcentage ou montant en FCFA */
  value: number;
  maxDiscount: number | null;
  minSubtotal: number | null;
  startsAt: Date;
  endsAt: Date | null;
  usageLimit: number | null;
  perAccountLimit: number | null;
  stackableWithSales: boolean;
}

export interface Coupon extends CouponRules {
  id: string;
  usedCount: number;
  active: boolean;
  createdAt: Date;
}

/** Code saisi par le client : sans casse ni espaces autour ; `null` s'il ne peut pas être un code. */
export function normalizeCouponCode(input: string): string | null {
  const code = input.trim().toUpperCase();
  return COUPON_CODE.test(code) ? code : null;
}

function invalid(message: string): never {
  throw new RangeError(message);
}

/** Règles d'un nouveau coupon (administrateur) ; lève RangeError avec le champ en cause. */
export function validateCouponRules(rules: CouponRules): CouponRules {
  const code = normalizeCouponCode(rules.code);
  if (!code) invalid("code : 4 à 20 lettres, chiffres ou tirets");
  if (!COUPON_KINDS.includes(rules.kind)) invalid("type : percent ou fixed");
  if (!Number.isSafeInteger(rules.value) || rules.value < 1) invalid("valeur : entier positif");
  if (rules.kind === "percent" && rules.value > COUPON_PERCENT_MAX)
    invalid(`pourcentage : ${COUPON_PERCENT_MAX} % au plus`);
  if (rules.kind === "fixed" && rules.value > COUPON_LIMITS.fixedMax) invalid("montant trop élevé");
  if (rules.maxDiscount !== null) {
    if (rules.kind !== "percent") invalid("plafond : pour un pourcentage seulement");
    if (!inRange(rules.maxDiscount, 1, COUPON_LIMITS.maxDiscountMax))
      invalid("plafond : entier positif, 10 000 000 FCFA au plus");
  }
  if (rules.minSubtotal !== null && !inRange(rules.minSubtotal, 0, COUPON_LIMITS.minSubtotalMax))
    invalid("minimum : entier positif ou nul, 100 000 000 FCFA au plus");
  // Montant fixe : le minimum d'articles doit dépasser le montant, sinon des articles deviendraient gratuits
  // (commande à 0 FCFA impossible à payer — relecture de sécurité du S5-T03)
  if (rules.kind === "fixed" && (rules.minSubtotal === null || rules.minSubtotal <= rules.value))
    invalid("minimum : obligatoire pour un montant fixe, et supérieur à ce montant");
  if (rules.endsAt && rules.endsAt <= rules.startsAt) invalid("fin : après le début");
  if (rules.usageLimit !== null && !inRange(rules.usageLimit, 1, COUPON_LIMITS.usageLimitMax))
    invalid(`utilisations : entier de 1 à ${COUPON_LIMITS.usageLimitMax}`);
  if (
    rules.perAccountLimit !== null &&
    !inRange(rules.perAccountLimit, 1, COUPON_LIMITS.perAccountLimitMax)
  )
    invalid(`utilisations par compte : entier de 1 à ${COUPON_LIMITS.perAccountLimitMax}`);
  return { ...rules, code };
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}

/** Le coupon peut-il servir maintenant (avant même de regarder le panier) ? Lève l'erreur métier sinon. */
export function assertUsable(coupon: Coupon, now: Date, usedByAccount: number): void {
  // Inconnu ou désactivé : même réponse (on ne dit pas qu'un code existe)
  if (!coupon.active) throw new OrdersError("COUPON_INVALIDE", "ce code coupon n'est pas valable");
  // Pas encore valable : même réponse qu'un code inconnu (une campagne à venir ne se devine pas avant son lancement)
  if (now < coupon.startsAt)
    throw new OrdersError("COUPON_INVALIDE", "ce code coupon n'est pas valable");
  if (coupon.endsAt && now >= coupon.endsAt)
    throw new OrdersError("COUPON_EXPIRE", "ce coupon a expiré");
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit)
    throw new OrdersError("COUPON_EPUISE", "ce coupon a déjà été utilisé autant de fois que prévu");
  if (coupon.perAccountLimit !== null && usedByAccount >= coupon.perAccountLimit)
    throw new OrdersError("COUPON_DEJA_UTILISE", "vous avez déjà utilisé ce coupon");
}

export interface DiscountLine {
  lineTotal: number;
  /** Prix barré de la variante : la ligne est « en promotion » s'il existe */
  onSale: boolean;
}

/**
 * Réduction sur les articles (jamais la livraison) : sur les lignes éligibles (hors promotion, sauf coupon cumulable),
 * pourcentage arrondi à l'entier inférieur et plafonné, ou montant fixe ; jamais plus que ces lignes.
 * Minimum de commande : sur le total des articles.
 */
export function computeDiscount(coupon: CouponRules, lines: readonly DiscountLine[]): number {
  const subtotal = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  if (coupon.minSubtotal !== null && subtotal < coupon.minSubtotal) {
    throw new OrdersError(
      "COUPON_MINIMUM_NON_ATTEINT",
      `ce coupon demande au moins ${coupon.minSubtotal.toLocaleString("fr-FR").replace(/\s/g, " ")} FCFA d'articles`,
    );
  }
  const base = lines
    .filter((l) => coupon.stackableWithSales || !l.onSale)
    .reduce((sum, l) => sum + l.lineTotal, 0);
  const raw =
    coupon.kind === "percent"
      ? Math.min(
          Math.floor((base * coupon.value) / 100),
          coupon.maxDiscount ?? Number.MAX_SAFE_INTEGER,
        )
      : coupon.value;
  // Jamais plus que les lignes éligibles, et jamais tous les articles : une commande à 0 FCFA ne peut pas être payée
  const discount = Math.min(raw, base, subtotal - 1);
  if (discount <= 0) {
    throw new OrdersError(
      "COUPON_NON_APPLICABLE",
      "ce coupon ne s'applique pas aux articles de votre panier (articles déjà en promotion)",
    );
  }
  return discount;
}
