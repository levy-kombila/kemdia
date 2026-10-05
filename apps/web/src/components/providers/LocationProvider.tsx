"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCity, type City } from "@/lib/delivery";

const STORAGE_KEY = "kemdia.location.v1";

export type DeliveryLocation = { cityId: string; neighborhood: string | null };

type LocationApi = {
  location: DeliveryLocation | null;
  city: City | undefined;
  setLocation: (loc: DeliveryLocation) => void;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
};

const LocationContext = createContext<LocationApi | null>(null);

/** Valide la valeur stockée : uniquement une ville connue du Gabon et un quartier de cette ville. */
function parseStored(raw: string | null): DeliveryLocation | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Partial<DeliveryLocation>;
    const city = getCity(typeof data.cityId === "string" ? data.cityId : null);
    if (!city) return null;
    const neighborhood =
      typeof data.neighborhood === "string" && city.neighborhoods.includes(data.neighborhood)
        ? data.neighborhood
        : null;
    return { cityId: city.id, neighborhood };
  } catch {
    return null;
  }
}

export function LocationProvider({ children }: { children: React.ReactNode }) {
  const [location, setLoc] = useState<DeliveryLocation | null>(null);
  const [isModalOpen, setOpen] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique du stockage navigateur après montage (évite un écart SSR/client)
      setLoc(parseStored(window.localStorage.getItem(STORAGE_KEY)));
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const setLocation = useCallback((loc: DeliveryLocation) => {
    setLoc(loc);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(loc));
    } catch {
      /* ignore */
    }
  }, []);

  const api = useMemo<LocationApi>(
    () => ({
      location,
      city: getCity(location?.cityId),
      setLocation,
      isModalOpen,
      openModal: () => setOpen(true),
      closeModal: () => setOpen(false),
    }),
    [location, setLocation, isModalOpen],
  );

  return <LocationContext.Provider value={api}>{children}</LocationContext.Provider>;
}

export function useDeliveryLocation(): LocationApi {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error("useDeliveryLocation doit être utilisé dans <LocationProvider>");
  return ctx;
}
