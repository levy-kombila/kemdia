"use client";

import { useEffect } from "react";
import { LocationModal } from "@/components/location/LocationModal";
import { markFirstHydrationDone } from "@/lib/hydration";
import { CartProvider } from "./CartProvider";
import { FavoritesProvider } from "./FavoritesProvider";
import { LocationProvider } from "./LocationProvider";
import { ToastProvider } from "./ToastProvider";

/** `signedIn` : un cookie de session existe (lu par le layout, sans appel à l'API) — panier du compte ou du navigateur. */
export function Providers({
  children,
  signedIn = false,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
}) {
  useEffect(markFirstHydrationDone, []);
  return (
    <ToastProvider>
      <CartProvider signedIn={signedIn}>
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
