/**
 * Logique pure du panier (sans React) — facile à tester.
 *
 * Une ligne de panier est identifiée par sa VARIANTE (S3-T05, FR-013) : deux couleurs d'un même produit
 * sont deux lignes. `productId` ne sert qu'à l'affichage (lien vers la fiche).
 *
 * Le panier côté navigateur ne sert qu'à l'AFFICHAGE. Au moment de la commande,
 * seuls { variantId, quantity } sont envoyés : le serveur relit prix, stock et
 * promotions en base. Un prix modifié dans le navigateur n'a donc aucun effet
 * (leçons CRIT-01, HIGH-05, HIGH-06 de l'audit).
 */

import {
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  type AvailabilityReason,
} from "@kemdia/contracts/constants";
import type { Cart } from "@kemdia/contracts";

/** Clé du panier dans le navigateur. v1 (identifiants numériques, sans variante) est abandonnée. */
export const CART_STORAGE_KEY = "kemdia.cart.v2";
export const LEGACY_CART_STORAGE_KEYS = ["kemdia.cart.v1"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Mêmes limites que le panier serveur (S5-T01) : le contrat les donne aux deux. */
export const MAX_QTY_PER_LINE = CART_MAX_QUANTITY;
export const MAX_LINES = CART_MAX_LINES;

export type CartLine = {
  /** Identifiant de la ligne : la variante choisie (UUID) */
  variantId: string;
  /** Produit de la variante (affichage, lien vers la fiche) */
  productId: string;
  slug: string;
  title: string;
  /** Nom de la variante (« Noir · 128 Go ») ; vide pour un produit sans choix */
  variantName: string;
  /** Prix indicatif au moment de l'ajout (FCFA) */
  price: number;
  image: string | null;
  quantity: number;
  /** Stock connu au moment de l'ajout, pour borner la quantité côté UI */
  maxQuantity: number;
  /**
   * Panier serveur (S5-T01) : la ligne n'est pas commandable telle quelle (BR-001). Absent dans le panier
   * du navigateur, qui n'est vérifié qu'au passage en caisse.
   */
  issue?: { reason: AvailabilityReason; available?: number };
};

export type CartState = {
  lines: CartLine[];
  /**
   * Réunion avec le panier du compte en cours (S5-T01) : identifiant tiré la première fois qu'on l'envoie, renvoyé tel quel
   * tant que le panier ne change pas (l'API n'applique qu'une fois la même réunion). Toute modification l'efface.
   */
  mergeId?: string;
};

export type CartAction =
  | { type: "add"; line: Omit<CartLine, "quantity">; quantity: number }
  | { type: "setQuantity"; variantId: string; quantity: number }
  | { type: "remove"; variantId: string }
  | { type: "clear" }
  | { type: "hydrate"; state: CartState };

export const emptyCart: CartState = { lines: [] };

function clampQty(q: number, max: number): number {
  const limit = Math.max(0, Math.min(max, MAX_QTY_PER_LINE));
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(Math.floor(q), limit));
}

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "add": {
      if (action.line.maxQuantity <= 0) return state;
      const existing = state.lines.find((l) => l.variantId === action.line.variantId);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.variantId === action.line.variantId
              ? {
                  ...l,
                  ...action.line,
                  quantity: clampQty(l.quantity + action.quantity, action.line.maxQuantity),
                }
              : l,
          ),
        };
      }
      if (state.lines.length >= MAX_LINES) return state;
      return {
        lines: [
          ...state.lines,
          { ...action.line, quantity: clampQty(action.quantity, action.line.maxQuantity) },
        ],
      };
    }
    case "setQuantity":
      return {
        lines: state.lines.map((l) =>
          l.variantId === action.variantId
            ? { ...l, quantity: clampQty(action.quantity, l.maxQuantity) }
            : l,
        ),
      };
    case "remove":
      return { lines: state.lines.filter((l) => l.variantId !== action.variantId) };
    case "clear":
      return emptyCart;
    case "hydrate":
      return action.state;
  }
}

export function cartCount(state: CartState): number {
  return state.lines.reduce((n, l) => n + l.quantity, 0);
}

/** Total des lignes commandables (comme le serveur : une ligne signalée indisponible ne compte pas). */
export function cartSubtotal(state: CartState): number {
  return state.lines.reduce((sum, l) => (l.issue ? sum : sum + l.price * l.quantity), 0);
}

/** Lignes envoyées au serveur pour la réunion après connexion : variante et quantité, jamais de prix (BR-004). */
export function linesToMerge(state: CartState): { variantId: string; quantity: number }[] {
  return state.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
}

/** Panier du compte (réponse de l'API, déjà vérifiée par le contrat) → lignes affichées par le site. */
export function fromServerCart(cart: Cart): CartState {
  return {
    lines: cart.lines.map((l) => ({
      variantId: l.variantId,
      productId: l.productId,
      slug: l.slug,
      title: l.title,
      variantName: l.variantName,
      price: l.price,
      image: l.image && l.image.startsWith("/images/") ? l.image : null,
      quantity: l.quantity,
      maxQuantity: l.maxQuantity,
      ...(l.ok
        ? {}
        : {
            issue: {
              reason: l.reason ?? "PRODUIT_INDISPONIBLE",
              ...(l.available !== undefined ? { available: l.available } : {}),
            },
          }),
    })),
  };
}

/** Phrase affichée sous une ligne que le serveur signale (BR-001). */
export function issueMessage(issue: NonNullable<CartLine["issue"]>): string {
  switch (issue.reason) {
    case "STOCK_INSUFFISANT":
      return issue.available
        ? `Plus que ${issue.available} en stock : diminuez la quantité pour commander.`
        : "Plus en stock pour le moment.";
    case "QUANTITE_INVALIDE":
      return "Quantité impossible : modifiez-la pour commander.";
    default:
      return "Plus disponible pour le moment : retirez-le pour commander.";
  }
}

/** Message d'une erreur du panier serveur (le code vient de l'API ; jamais son texte). */
export function cartErrorMessage(code: string): string {
  switch (code) {
    case "PANIER_PLEIN":
      return `Votre panier contient déjà ${MAX_LINES} produits différents : retirez-en un pour en ajouter un autre.`;
    case "PRODUIT_INDISPONIBLE":
      return "Ce produit n'est plus disponible pour le moment.";
    case "VARIANTE_INCONNUE":
      return "Ce produit n'existe plus.";
    case "TROP_DE_REQUETES":
      return "Trop de demandes d'un coup : réessayez dans un instant.";
    case "SESSION_INVALIDE":
      return "Votre session a expiré : reconnectez-vous pour retrouver votre panier.";
    case "PANIER_OCCUPE":
      return "Votre panier est en cours de mise à jour : réessayez dans un instant.";
    default:
      return "Le panier est momentanément indisponible : réessayez dans un instant.";
  }
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length < 300;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * Le localStorage est une donnée NON fiable (modifiable par l'utilisateur ou une extension).
 * On valide chaque champ et on jette ce qui ne correspond pas.
 */
export function parseStoredCart(raw: string | null): CartState {
  if (!raw) return emptyCart;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || !Array.isArray((data as CartState).lines))
      return emptyCart;
    const lines: CartLine[] = [];
    for (const l of (data as { lines: unknown[] }).lines.slice(0, MAX_LINES)) {
      if (!l || typeof l !== "object") continue;
      const c = l as Record<string, unknown>;
      if (!isStr(c.variantId) || !UUID.test(c.variantId)) continue;
      if (!isStr(c.productId) || !UUID.test(c.productId)) continue;
      if (!isStr(c.slug) || !SLUG.test(c.slug) || !isStr(c.title)) continue;
      if (lines.some((existing) => existing.variantId === c.variantId)) continue;
      if (!isNum(c.price) || !isNum(c.quantity) || !isNum(c.maxQuantity) || c.maxQuantity <= 0)
        continue;
      const image = isStr(c.image) && c.image.startsWith("/images/") ? c.image : null;
      lines.push({
        variantId: c.variantId,
        productId: c.productId,
        slug: c.slug,
        title: c.title,
        variantName: typeof c.variantName === "string" ? c.variantName.slice(0, 80) : "",
        price: Math.round(c.price),
        image,
        maxQuantity: Math.floor(c.maxQuantity),
        quantity: clampQty(c.quantity, c.maxQuantity),
      });
    }
    const mergeId = (data as { mergeId?: unknown }).mergeId;
    return typeof mergeId === "string" && UUID.test(mergeId) && lines.length
      ? { lines, mergeId: mergeId.toLowerCase() }
      : { lines };
  } catch {
    return emptyCart;
  }
}
