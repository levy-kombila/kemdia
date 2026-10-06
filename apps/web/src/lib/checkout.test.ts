import { describe, expect, it } from "vitest";
import type { CartLine } from "./cart";
import {
  buildOrderRequest,
  codAvailability,
  validateAddress,
  validatePaymentPhone,
  type Address,
} from "./checkout";

const address: Address = {
  fullName: "Marie Nze",
  phone: "077 12 34 56",
  cityId: "libreville",
  neighborhood: "Glass",
  landmark: "Face à la pharmacie du Bord de mer",
};

describe("validateAddress", () => {
  it("accepte une adresse complète", () => {
    expect(validateAddress(address)).toEqual({});
  });
  it("signale chaque champ manquant ou invalide", () => {
    const e = validateAddress({
      fullName: "Marie",
      phone: "0123",
      cityId: "douala",
      neighborhood: "",
      landmark: "x",
    });
    expect(Object.keys(e).sort()).toEqual(["cityId", "fullName", "landmark", "phone"]);
  });
  it("exige un quartier connu de la ville", () => {
    expect(
      validateAddress({ ...address, neighborhood: "Quartier inventé" }).neighborhood,
    ).toBeDefined();
    expect(validateAddress({ ...address, neighborhood: "Autre quartier" })).toEqual({});
  });
});

describe("paiement à la livraison (BR-011, valeurs provisoires)", () => {
  it("autorisé à Libreville sous le plafond", () => {
    expect(codAvailability("libreville", 100_000)).toEqual({ allowed: true });
  });
  it("refusé au-delà du plafond ou hors Grand Libreville", () => {
    expect(codAvailability("libreville", 100_001).allowed).toBe(false);
    expect(codAvailability("franceville", 10_000).allowed).toBe(false);
  });
});

describe("validatePaymentPhone", () => {
  it("vérifie l'opérateur du numéro", () => {
    expect(validatePaymentPhone("airtel", "077 12 34 56")).toBeNull();
    expect(validatePaymentPhone("moov", "077 12 34 56")).toMatch(/pas un numéro Moov/);
    expect(validatePaymentPhone("moov", "066 12 34 56")).toBeNull();
    expect(validatePaymentPhone("cod", "")).toBeNull();
  });
});

describe("buildOrderRequest", () => {
  it("n'envoie que la variante et la quantité, jamais de prix (S3-T05)", () => {
    const lines: CartLine[] = [
      {
        variantId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a",
        productId: "0b9f1c7e-3f5a-4b8e-9c2d-1a2b3c4d5e6f",
        slug: "x",
        title: "X",
        variantName: "",
        price: 1,
        image: null,
        quantity: 2,
        maxQuantity: 5,
      },
    ];
    const req = buildOrderRequest(lines, address, "airtel", "077123456");
    expect(req.items).toEqual([{ variantId: "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a", quantity: 2 }]);
    expect(JSON.stringify(req)).not.toMatch(/price|total|fee/i);
    expect(req.delivery.phone).toBe("+241077123456");
    expect(req.payment).toEqual({ method: "airtel", phone: "+241077123456" });
  });
});
