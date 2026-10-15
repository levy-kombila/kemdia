import { describe, expect, it } from "vitest";
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
  it("n'envoie que l'adresse et le paiement : ni article, ni prix, ni total (S5-T07, BR-004)", () => {
    const req = buildOrderRequest(
      { ...address, fullName: "  Marie   Nze ", landmark: " Face à la pharmacie " },
      "airtel",
      "077123456",
    );
    expect(Object.keys(req).sort()).toEqual(["delivery", "payment"]);
    expect(JSON.stringify(req)).not.toMatch(/price|total|fee|items|variant/i);
    expect(req.delivery.fullName).toBe("Marie Nze");
    expect(req.delivery.landmark).toBe("Face à la pharmacie");
    expect(req.delivery.phone).toBe("+241077123456");
    expect(req.payment).toEqual({ method: "airtel", phone: "+241077123456" });
  });

  it("paiement à la livraison : aucun numéro de paiement", () => {
    expect(buildOrderRequest(address, "cod", "077123456").payment).toEqual({ method: "cod" });
  });
});
