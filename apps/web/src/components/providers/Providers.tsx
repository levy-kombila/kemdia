"use client";

import { useEffect } from "react";
import { LocationModal } from "@/components/location/LocationModal";
import { markFirstHydrationDone } from "@/lib/hydration";
import { ZONES, type DeliveryTariffTable } from "@/lib/delivery";
import { CartProvider } from "./CartProvider";
import { DeliveryTariffsProvider } from "./DeliveryTariffsProvider";
import { FavoritesProvider } from "./FavoritesProvider";
import { LocationProvider } from "./LocationProvider";
import { ToastProvider } from "./ToastProvider";

/** `signedIn` : un cookie de session existe (lu par le layout, sans appel à l'API) — panier du compte ou du navigateur. */
export function Providers({
  children,
  signedIn = false,
  tariffs,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
  /** Barème de livraison lu par le serveur (S7-T02) ; absent : barème du contrat */
  tariffs?: DeliveryTariffTable;
}) {
  useEffect(markFirstHydrationDone, []);
  return (
    <ToastProvider>
      <DeliveryTariffsProvider tariffs={tariffs ?? ZONES}>
        <CartProvider signedIn={signedIn}>
          <FavoritesProvider>
            <LocationProvider>
              {children}
              <LocationModal />
            </LocationProvider>
          </FavoritesProvider>
        </CartProvider>
      </DeliveryTariffsProvider>
    </ToastProvider>
  );
}
