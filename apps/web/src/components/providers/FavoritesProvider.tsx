"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isFavorite, parseStoredFavorites, toggleFavorite, type Favorite } from "@/lib/favorites";

const STORAGE_KEY = "kemdia.favorites.v1";

type FavoritesApi = {
  items: Favorite[];
  hydrated: boolean;
  has: (productId: string) => boolean;
  /** Renvoie true si le produit vient d'être ajouté */
  toggle: (item: Omit<Favorite, "addedAt">) => boolean;
  remove: (productId: string) => void;
};

const FavoritesContext = createContext<FavoritesApi | null>(null);

function save(list: Favorite[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* stockage bloqué : favoris gardés en mémoire */
  }
}

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Favorite[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const load = () => {
      let raw: string | null = null;
      try {
        raw = window.localStorage.getItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      setItems(parseStoredFavorites(raw));
      setHydrated(true);
    };
    load();
    const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && load();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggle = useCallback<FavoritesApi["toggle"]>(
    (item) => {
      const added = !isFavorite(items, item.productId);
      const next = toggleFavorite(items, { ...item, addedAt: Date.now() });
      setItems(next);
      save(next);
      return added;
    },
    [items],
  );

  const remove = useCallback(
    (productId: string) => {
      const next = items.filter((f) => f.productId !== productId);
      setItems(next);
      save(next);
    },
    [items],
  );

  const api = useMemo<FavoritesApi>(
    () => ({ items, hydrated, has: (id) => isFavorite(items, id), toggle, remove }),
    [items, hydrated, toggle, remove],
  );
  return <FavoritesContext.Provider value={api}>{children}</FavoritesContext.Provider>;
}

export function useFavorites(): FavoritesApi {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavorites doit être utilisé dans <FavoritesProvider>");
  return ctx;
}
