"use client";

import { LocationModal } from "@/components/location/LocationModal";
import { CartProvider } from "./CartProvider";
import { LocationProvider } from "./LocationProvider";
import { ToastProvider } from "./ToastProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <CartProvider>
        <LocationProvider>
          {children}
          <LocationModal />
        </LocationProvider>
      </CartProvider>
    </ToastProvider>
  );
}
