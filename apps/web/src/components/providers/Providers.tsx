"use client";

import { useEffect } from "react";
import { LocationModal } from "@/components/location/LocationModal";
import { markFirstHydrationDone } from "@/lib/hydration";
import { CartProvider } from "./CartProvider";
import { FavoritesProvider } from "./FavoritesProvider";
import { LocationProvider } from "./LocationProvider";
import { ToastProvider } from "./ToastProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(markFirstHydrationDone, []);
  return (
    <ToastProvider>
      <CartProvider>
        <FavoritesProvider>
          <LocationProvider>
            {children}
            <LocationModal />
          </LocationProvider>
        </FavoritesProvider>
      </CartProvider>
    </ToastProvider>
  );
}
