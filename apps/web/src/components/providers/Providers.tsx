"use client";

import { LocationModal } from "@/components/location/LocationModal";
import { CartProvider } from "./CartProvider";
import { FavoritesProvider } from "./FavoritesProvider";
import { LocationProvider } from "./LocationProvider";
import { ToastProvider } from "./ToastProvider";

export function Providers({ children }: { children: React.ReactNode }) {
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
