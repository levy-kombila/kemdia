"use client";

import { createContext, useCallback, useContext } from "react";
import { estimateDelivery, ZONES, type DeliveryTariffTable } from "@/lib/delivery";

/** Barème de la page en cours ; sans fournisseur (tests), barème du contrat. */
const TariffsContext = createContext<DeliveryTariffTable>(ZONES);

/**
 * Barème de livraison lu par le SERVEUR du site sur l'API (S7-T02, ADR-0041), transmis aux composants du navigateur :
 * fiche produit, panier, choix de la ville, caisse. Une estimation : le devis de l'API fait foi au paiement.
 */
export function DeliveryTariffsProvider({
  tariffs,
  children,
}: {
  tariffs: DeliveryTariffTable;
  children: React.ReactNode;
}) {
  return <TariffsContext.Provider value={tariffs}>{children}</TariffsContext.Provider>;
}

/** `estimateDelivery` avec le barème en vigueur. */
export function useDeliveryEstimate() {
  const tariffs = useContext(TariffsContext);
  return useCallback(
    (cityId: string, subtotal: number) => estimateDelivery(cityId, subtotal, tariffs),
    [tariffs],
  );
}
