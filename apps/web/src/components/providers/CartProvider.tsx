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
  cartCount,
  cartReducer,
  cartSubtotal,
  emptyCart,
  parseStoredCart,
  type CartLine,
  type CartState,
} from "@/lib/cart";

const STORAGE_KEY = "kemdia.cart.v1";

type CartApi = {
  state: CartState;
  hydrated: boolean;
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartApi | null>(null);

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
    (productId, quantity) => dispatch({ type: "setQuantity", productId, quantity }),
    [],
  );
  const remove = useCallback((productId: string) => dispatch({ type: "remove", productId }), []);
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

  return <CartContext.Provider value={api}>{children}</CartContext.Provider>;
}

export function useCart(): CartApi {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart doit être utilisé dans <CartProvider>");
  return ctx;
}
