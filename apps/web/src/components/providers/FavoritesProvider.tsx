"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { isFavorite, parseStoredFavorites, toggleFavorite, type Favorite } from "@/lib/favorites";

const STORAGE_KEY = "kemdia.favorites.v1";

/**
 * Petit « magasin » de favoris hors de React : chaque cœur s'abonne uniquement à SON produit.
 * Ajouter un favori ne redessine donc qu'un seul bouton, pas les dizaines de cartes de la page (budget de performance S2-T08).
 */
function createFavoritesStore() {
  let items: Favorite[] = [];
  let hydrated = false;
  let snapshot = { items, hydrated };
  const listeners = new Set<() => void>();
  const emit = () => {
    snapshot = { items, hydrated };
    listeners.forEach((l) => l());
  };
  const save = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* stockage bloqué : favoris gardés en mémoire */
    }
  };
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    has: (productId: string) => hydrated && isFavorite(items, productId),
    load() {
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      items = parseStoredFavorites(raw);
      hydrated = true;
      emit();
    },
    /** Renvoie true si le produit vient d'être ajouté */
    toggle(item: Omit<Favorite, "addedAt">): boolean {
      const added = !isFavorite(items, item.productId);
      items = toggleFavorite(items, { ...item, addedAt: Date.now() });
      save();
      emit();
      return added;
    },
    remove(productId: string) {
      items = items.filter((f) => f.productId !== productId);
      save();
      emit();
    },
  };
}

type FavoritesStore = ReturnType<typeof createFavoritesStore>;
const FavoritesContext = createContext<FavoritesStore | null>(null);
const SERVER_SNAPSHOT = { items: [] as Favorite[], hydrated: false };

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [store] = useState(createFavoritesStore);

  useEffect(() => {
    store.load();
    const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && store.load();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [store]);

  return <FavoritesContext.Provider value={store}>{children}</FavoritesContext.Provider>;
}

function useStore(): FavoritesStore {
  const store = useContext(FavoritesContext);
  if (!store) throw new Error("useFavorites doit être utilisé dans <FavoritesProvider>");
  return store;
}

/** Liste complète (page Mes favoris, compteur de l'en-tête). */
export function useFavorites() {
  const store = useStore();
  const { items, hydrated } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    () => SERVER_SNAPSHOT,
  );
  return { items, hydrated, has: store.has, toggle: store.toggle, remove: store.remove };
}

/** Un seul produit : le composant ne se redessine que si CE produit entre ou sort des favoris. */
export function useIsFavorite(productId: string) {
  const store = useStore();
  const active = useSyncExternalStore(
    store.subscribe,
    () => store.has(productId),
    () => false,
  );
  return { active, toggle: store.toggle };
}
