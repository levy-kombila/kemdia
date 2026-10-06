"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from "react";
import {
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEYS,
  cartCount,
  cartReducer,
  cartSubtotal,
  emptyCart,
  parseStoredCart,
  type CartLine,
  type CartState,
} from "@/lib/cart";

const STORAGE_KEY = CART_STORAGE_KEY;

type CartApi = {
  state: CartState;
  hydrated: boolean;
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartApi | null>(null);

type CartActions = Pick<CartApi, "add" | "setQuantity" | "remove" | "clear">;
/**
 * Actions seules, dans un contexte à part dont la valeur ne change jamais : les dizaines de boutons
 * « Ajouter au panier » d'une page ne se redessinent pas à chaque modification du panier (budget de performance S2-T08).
 */
const CartActionsContext = createContext<CartActions | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, emptyCart);
  const [hydrated, setHydrated] = useState(false);

  // Chargement initial + synchronisation entre onglets
  useEffect(() => {
    const load = () => {
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        // navigation privée / stockage bloqué : panier en mémoire uniquement
      }
      dispatch({ type: "hydrate", state: parseStoredCart(raw) });
      setHydrated(true);
    };
    load();
    // Ancien panier (v1, sans variantes) : abandonné et effacé proprement (S3-T05)
    try {
      for (const key of LEGACY_CART_STORAGE_KEYS) window.localStorage.removeItem(key);
    } catch {
      /* stockage bloqué : rien à effacer */
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, hydrated]);

  const add = useCallback<CartApi["add"]>(
    (line, quantity = 1) => dispatch({ type: "add", line, quantity }),
    [],
  );
  const setQuantity = useCallback<CartApi["setQuantity"]>(
    (variantId, quantity) => dispatch({ type: "setQuantity", variantId, quantity }),
    [],
  );
  const remove = useCallback((variantId: string) => dispatch({ type: "remove", variantId }), []);
  const clear = useCallback(() => dispatch({ type: "clear" }), []);

  const api = useMemo<CartApi>(
    () => ({
      state,
      hydrated,
      count: cartCount(state),
      subtotal: cartSubtotal(state),
      add,
      setQuantity,
      remove,
      clear,
    }),
    [state, hydrated, add, setQuantity, remove, clear],
  );

  const actions = useMemo<CartActions>(
    () => ({ add, setQuantity, remove, clear }),
    [add, setQuantity, remove, clear],
  );

  return (
    <CartActionsContext.Provider value={actions}>
      <CartContext.Provider value={api}>{children}</CartContext.Provider>
    </CartActionsContext.Provider>
  );
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart doit être utilisé dans <CartProvider>");
  return ctx;
}

export function useCartActions(): CartActions {
  const ctx = useContext(CartActionsContext);
  if (!ctx) throw new Error("useCartActions doit être utilisé dans <CartProvider>");
  return ctx;
}
