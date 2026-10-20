"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getCity, type City } from "@/lib/delivery";

const STORAGE_KEY = "kemdia.location.v1";
/**
 * Ville choisie, aussi en cookie (S7.5-T03, choix du 2026-10-20) : le serveur la lit pour mettre en avant, à prix
 * égal, l'offre d'une boutique de cette ville. La ville seule (identifiant connu), jamais le quartier.
 */
export const CITY_COOKIE = "kemdia_ville";

function writeCityCookie(cityId: string): void {
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${CITY_COOKIE}=${encodeURIComponent(cityId)}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  } catch {
    /* cookies indisponibles */
  }
}

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
      const stored = parseStored(window.localStorage.getItem(STORAGE_KEY));
      // Ville choisie avant le S7.5 : le cookie est posé au premier passage
      if (stored && !document.cookie.includes(`${CITY_COOKIE}=`)) writeCityCookie(stored.cityId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture unique du stockage navigateur après montage (évite un écart SSR/client)
      setLoc(stored);
    } catch {
      /* stockage indisponible */
    }
  }, []);

  const setLocation = useCallback((loc: DeliveryLocation) => {
    setLoc(loc);
    if (getCity(loc.cityId)) writeCityCookie(loc.cityId);
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
