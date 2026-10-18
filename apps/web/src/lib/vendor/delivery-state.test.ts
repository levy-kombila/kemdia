import { describe, expect, it } from "vitest";
import { deliveryState } from "./labels";

describe("livraison vue par le vendeur (S7-T02)", () => {
  it("seulement pour une part acceptée ; lecture seule", () => {
    expect(deliveryState("pending", "confirmed")).toBeNull();
    expect(deliveryState("refused", "cancelled")).toBeNull();
    expect(deliveryState("accepted", "confirmed")).toBeNull();
    expect(deliveryState("accepted", "preparing")?.label).toBe("En attente du livreur");
    expect(deliveryState("accepted", "shipped")?.label).toBe("En livraison");
    expect(deliveryState("accepted", "delivered")).toEqual({
      label: "Livrée au client",
      tone: "ok",
    });
    expect(deliveryState("accepted", "cancelled")?.label).toBe("Commande annulée");
  });
});
