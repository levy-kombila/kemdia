"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useOptionalToast } from "@/components/providers/ToastProvider";
import {
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEYS,
  MAX_QTY_PER_LINE,
  cartCount,
  cartErrorMessage,
  cartReducer,
  cartSubtotal,
  emptyCart,
  fromServerCart,
  linesToMerge,
  parseStoredCart,
  type CartAction,
  type CartLine,
  type CartState,
} from "@/lib/cart";
import {
  addToServerCart,
  clearServerCart,
  removeFromServerCart,
  setServerCartQuantity,
  syncCart,
  type CartActionResult,
} from "@/lib/orders/cart-actions";

const STORAGE_KEY = CART_STORAGE_KEY;

/**
 * Où vit le panier (S5-T01, ADR-0023) :
 * - `local` : visiteur non connecté → navigateur (`localStorage`), comme depuis le S1 ;
 * - `server` : compte connecté → panier du compte dans l'API, le même sur tous ses appareils.
 */
export type CartMode = "local" | "server";

type CartApi = {
  state: CartState;
  hydrated: boolean;
  mode: CartMode;
  count: number;
  /** Total des lignes commandables (indicatif : la commande recalcule tout côté serveur) */
  subtotal: number;
  /** Connecté : le serveur a vérifié chaque ligne (BR-001) ; une ligne signalée bloque le passage en caisse */
  canCheckout: boolean;
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

function readLocal(): CartState {
  try {
    return parseStoredCart(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    // navigation privée / stockage bloqué : panier en mémoire uniquement
    return emptyCart;
  }
}

function writeLocal(state: CartState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* stockage bloqué : rien à faire */
  }
}

/** Identifiant d'une réunion (UUID v4) ; `crypto.randomUUID` n'existe qu'en HTTPS ou sur la machine locale. */
function newMergeId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const clampQuantity = (q: number) =>
  Math.max(1, Math.min(Number.isFinite(q) ? Math.floor(q) : 1, MAX_QTY_PER_LINE));

/**
 * @param signedIn indice posé par le layout : un cookie de session existe (rien n'est appelé pour le savoir).
 * Il change après une connexion ou une déconnexion (Next.js redessine le layout quand une action serveur
 * pose ou efface un cookie) : le panier se resynchronise alors.
 */
export function CartProvider({
  children,
  signedIn = false,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
}) {
  const [state, dispatch] = useReducer(cartReducer, emptyCart);
  const [hydrated, setHydrated] = useState(false);
  const [mode, setMode] = useState<CartMode>("local");
  const { notify } = useOptionalToast();

  // Lus par les actions (stables) sans les recréer à chaque changement
  const modeRef = useRef<CartMode>("local");
  const confirmed = useRef<CartState>(emptyCart);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const notifyRef = useRef(notify);
  useEffect(() => {
    notifyRef.current = notify;
  }, [notify]);

  const showLocal = useCallback((local: CartState) => {
    modeRef.current = "local";
    setMode("local");
    dispatch({ type: "hydrate", state: local });
  }, []);

  const showServer = useCallback((server: CartState) => {
    modeRef.current = "server";
    confirmed.current = server;
    setMode("server");
    dispatch({ type: "hydrate", state: server });
  }, []);

  // Chargement, puis à chaque connexion / déconnexion
  useEffect(() => {
    // Ancien panier (v1, sans variantes) : abandonné et effacé proprement (S3-T05)
    try {
      for (const key of LEGACY_CART_STORAGE_KEYS) window.localStorage.removeItem(key);
    } catch {
      /* stockage bloqué : rien à effacer */
    }
    const local = readLocal();
    const loadLocal = () => {
      showLocal(local);
      setHydrated(true);
    };
    if (!signedIn) {
      loadLocal();
      return;
    }
    let cancelled = false;
    // Réunion idempotente (relecture de sécurité du S5-T01) : le panier du navigateur garde un identifiant de réunion,
    // tiré une fois et renvoyé tel quel tant qu'il ne change pas. Double rendu, deuxième onglet, réponse perdue :
    // l'API n'applique qu'une fois la même réunion. Le panier du navigateur n'est vidé qu'après la réponse.
    let pending: CartState = local;
    if (local.lines.length && !local.mergeId) {
      pending = { ...local, mergeId: newMergeId() };
      writeLocal(pending);
    }
    syncCart(linesToMerge(pending), pending.mergeId)
      .catch(() => ({ status: "unavailable" as const }))
      .then((result) => {
        if (result.status === "signed-in") {
          // Réunie (ou déjà réunie) : le panier du navigateur n'a plus lieu d'être, sauf s'il a changé entre-temps
          if (pending.mergeId && readLocal().mergeId === pending.mergeId) writeLocal(emptyCart);
          if (cancelled) return;
          showServer(fromServerCart(result.cart));
          if (result.ignored > 0) {
            notifyRef.current(
              result.ignored === 1
                ? "Un article de votre panier n'est plus disponible : il n'a pas été repris."
                : `${result.ignored} articles de votre panier ne sont plus disponibles : ils n'ont pas été repris.`,
              "error",
            );
          }
        } else {
          // Session refusée ou API injoignable : le panier du navigateur reste, avec son identifiant de réunion
          // (renvoyé au prochain chargement : s'il avait déjà été appliqué, rien ne double)
          if (cancelled) return;
          showLocal(readLocal());
        }
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn, showLocal, showServer]);

  // Synchronisation entre onglets : panier du navigateur seulement
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && modeRef.current === "local") {
        dispatch({ type: "hydrate", state: readLocal() });
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Le panier du navigateur est enregistré ; JAMAIS celui du compte (il serait réuni une seconde fois)
  useEffect(() => {
    if (hydrated && mode === "local") writeLocal(state);
  }, [state, hydrated, mode]);

  /**
   * Connecté : la modification s'affiche tout de suite, puis l'API répond avec le panier vérifié.
   * Les demandes partent l'une après l'autre (dans l'ordre des clics) ; seule la dernière réponse redessine le panier.
   */
  const viaServer = useCallback(
    (optimistic: CartAction, call: () => Promise<CartActionResult>) => {
      dispatch(optimistic);
      pending.current++;
      queue.current = queue.current.then(async () => {
        let result: CartActionResult;
        try {
          result = await call();
        } catch {
          result = { ok: false, code: "INDISPONIBLE" };
        }
        pending.current--;
        if (modeRef.current !== "server") return;
        if (result.ok) {
          confirmed.current = fromServerCart(result.cart);
          if (pending.current === 0) dispatch({ type: "hydrate", state: confirmed.current });
        } else if (result.code === "SESSION_INVALIDE") {
          notifyRef.current(cartErrorMessage(result.code), "error");
          showLocal(readLocal());
        } else {
          notifyRef.current(cartErrorMessage(result.code), "error");
          dispatch({ type: "hydrate", state: confirmed.current });
        }
      });
    },
    [showLocal],
  );

  const add = useCallback<CartApi["add"]>(
    (line, quantity = 1) => {
      const q = clampQuantity(quantity);
      if (modeRef.current === "server")
        viaServer({ type: "add", line, quantity: q }, () => addToServerCart(line.variantId, q));
      else dispatch({ type: "add", line, quantity: q });
    },
    [viaServer],
  );
  const setQuantity = useCallback<CartApi["setQuantity"]>(
    (variantId, quantity) => {
      const q = clampQuantity(quantity);
      if (modeRef.current === "server")
        viaServer({ type: "setQuantity", variantId, quantity: q }, () =>
          setServerCartQuantity(variantId, q),
        );
      else dispatch({ type: "setQuantity", variantId, quantity: q });
    },
    [viaServer],
  );
  const remove = useCallback(
    (variantId: string) => {
      if (modeRef.current === "server")
        viaServer({ type: "remove", variantId }, () => removeFromServerCart(variantId));
      else dispatch({ type: "remove", variantId });
    },
    [viaServer],
  );
  const clear = useCallback(() => {
    if (modeRef.current === "server") viaServer({ type: "clear" }, () => clearServerCart());
    else dispatch({ type: "clear" });
  }, [viaServer]);

  const api = useMemo<CartApi>(
    () => ({
      state,
      hydrated,
      mode,
      count: cartCount(state),
      subtotal: cartSubtotal(state),
      canCheckout: state.lines.length > 0 && state.lines.every((l) => !l.issue),
      add,
      setQuantity,
      remove,
      clear,
    }),
    [state, hydrated, mode, add, setQuantity, remove, clear],
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
