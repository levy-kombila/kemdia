/**
 * Logique pure du panier (sans React) — facile à tester.
 *
 * Le panier côté navigateur ne sert qu'à l'AFFICHAGE. Au moment de la commande,
 * seuls { productId, quantity } seront envoyés : le backend relira prix, stock et
 * promotions en base. Un prix modifié dans le navigateur n'aura donc aucun effet
 * (leçons CRIT-01, HIGH-05, HIGH-06 de l'audit).
 */

export const MAX_QTY_PER_LINE = 20;
export const MAX_LINES = 50;

export type CartLine = {
  productId: string;
  slug: string;
  title: string;
  /** Prix indicatif au moment de l'ajout (FCFA) */
  price: number;
  image: string | null;
  quantity: number;
  /** Stock connu au moment de l'ajout, pour borner la quantité côté UI */
  maxQuantity: number;
};

export type CartState = { lines: CartLine[] };

export type CartAction =
  | { type: "add"; line: Omit<CartLine, "quantity">; quantity: number }
  | { type: "setQuantity"; productId: string; quantity: number }
  | { type: "remove"; productId: string }
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
      const existing = state.lines.find((l) => l.productId === action.line.productId);
      if (existing) {
        return {
          lines: state.lines.map((l) =>
            l.productId === action.line.productId
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
          l.productId === action.productId
            ? { ...l, quantity: clampQty(action.quantity, l.maxQuantity) }
            : l,
        ),
      };
    case "remove":
      return { lines: state.lines.filter((l) => l.productId !== action.productId) };
    case "clear":
      return emptyCart;
    case "hydrate":
      return action.state;
  }
}

export function cartCount(state: CartState): number {
  return state.lines.reduce((n, l) => n + l.quantity, 0);
}

export function cartSubtotal(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.price * l.quantity, 0);
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
      if (!isStr(c.productId) || !isStr(c.slug) || !isStr(c.title)) continue;
      if (!isNum(c.price) || !isNum(c.quantity) || !isNum(c.maxQuantity) || c.maxQuantity <= 0)
        continue;
      const image = isStr(c.image) && c.image.startsWith("/images/") ? c.image : null;
      lines.push({
        productId: c.productId,
        slug: c.slug,
        title: c.title,
        price: Math.round(c.price),
        image,
        maxQuantity: Math.floor(c.maxQuantity),
        quantity: clampQty(c.quantity, c.maxQuantity),
      });
    }
    return { lines };
  } catch {
    return emptyCart;
  }
}
