import { describe, expect, it } from "vitest";
import { validateAddress, type CityRule } from "./delivery-address.js";
import {
  canTransition,
  clientCanCancel,
  initialState,
  newReference,
  PAYMENT_WINDOW_MS,
  priceLines,
  REFERENCE_PATTERN,
  validatePayment,
} from "./order.js";
import { OrdersError } from "./orders-error.js";

const codeOf = (run: () => unknown): string | undefined => {
  try {
    run();
  } catch (error) {
    return error instanceof OrdersError ? error.code : `autre : ${String(error)}`;
  }
  return undefined;
};

const LIBREVILLE: CityRule = {
  id: "libreville",
  name: "Libreville",
  neighborhoods: ["Glass", "Nkembo"],
};
const ADDRESS = {
  fullName: "  Marie   Nze ",
  phone: "077 12 34 56",
  neighborhood: "Glass",
  landmark: "Portail bleu face à la pharmacie",
};

describe("statuts (S5-T02)", () => {
  it("suivent l'ordre attendu ; BR-010 : une commande livrée ne s'annule plus", () => {
    expect(canTransition("pending_payment", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "preparing")).toBe(true);
    expect(canTransition("preparing", "shipped")).toBe(true);
    expect(canTransition("shipped", "delivered")).toBe(true);
    expect(canTransition("delivered", "cancelled")).toBe(false);
    expect(canTransition("shipped", "cancelled")).toBe(false);
    expect(canTransition("cancelled", "confirmed")).toBe(false);
    expect(canTransition("pending_payment", "shipped")).toBe(false);
  });

  it("le client annule lui-même jusqu'à l'expédition (choix du 2026-10-10)", () => {
    for (const method of ["airtel", "moov", "cod"] as const) {
      expect(clientCanCancel("pending_payment", method)).toBe(true);
      expect(clientCanCancel("shipped", method)).toBe(false);
      expect(clientCanCancel("delivered", method)).toBe(false);
      expect(clientCanCancel("cancelled", method)).toBe(false);
    }
    expect(clientCanCancel("confirmed", "cod")).toBe(true);
    expect(clientCanCancel("preparing", "cod")).toBe(true);
  });

  it("Mobile Money déjà payée : pas d'annulation par le client tant que le remboursement n'existe pas", () => {
    expect(clientCanCancel("confirmed", "airtel")).toBe(false);
    expect(clientCanCancel("preparing", "moov")).toBe(false);
  });

  it("Mobile Money : 30 minutes pour payer ; à la livraison : confirmée tout de suite", () => {
    const now = new Date("2026-10-10T10:00:00Z");
    expect(initialState("airtel", now)).toEqual({
      status: "pending_payment",
      paymentDueAt: new Date(now.getTime() + PAYMENT_WINDOW_MS),
    });
    expect(PAYMENT_WINDOW_MS).toBe(30 * 60_000);
    expect(initialState("cod", now)).toEqual({ status: "confirmed", paymentDueAt: null });
  });
});

describe("numéro de commande", () => {
  it("KMD- + 6 caractères de l'alphabet, quel que soit l'octet tiré", () => {
    for (let b = 0; b < 256; b++) {
      expect(newReference(() => new Uint8Array(6).fill(b))).toMatch(REFERENCE_PATTERN);
    }
    expect(newReference(() => new Uint8Array([0, 1, 2, 29, 30, 31]))).toBe("KMD-ABC789");
  });
});

describe("paiement", () => {
  it("le numéro doit être celui de l'opérateur choisi (07… Airtel, 06… Moov)", () => {
    expect(validatePayment("airtel", "077 12 34 56")).toEqual({
      method: "airtel",
      phone: "+241077123456",
    });
    expect(validatePayment("moov", "+241 66 12 34 56")).toEqual({
      method: "moov",
      phone: "+241066123456",
    });
    expect(codeOf(() => validatePayment("airtel", "066123456"))).toBe("NUMERO_PAIEMENT_INVALIDE");
    expect(codeOf(() => validatePayment("moov", undefined))).toBe("NUMERO_PAIEMENT_INVALIDE");
    expect(codeOf(() => validatePayment("airtel", "0112345"))).toBe("NUMERO_PAIEMENT_INVALIDE");
  });

  it("à la livraison : aucun numéro gardé", () => {
    expect(validatePayment("cod", "077123456")).toEqual({ method: "cod", phone: null });
  });
});

describe("adresse de livraison", () => {
  it("nettoie et normalise", () => {
    expect(validateAddress(ADDRESS, LIBREVILLE)).toEqual({
      fullName: "Marie Nze",
      phone: "+241077123456",
      cityId: "libreville",
      cityName: "Libreville",
      neighborhood: "Glass",
      landmark: "Portail bleu face à la pharmacie",
    });
    expect(
      validateAddress({ ...ADDRESS, neighborhood: "Autre quartier" }, LIBREVILLE).neighborhood,
    ).toBe("Autre quartier");
  });

  it("refuse chaque champ invalide (ADRESSE_INVALIDE)", () => {
    for (const bad of [
      { ...ADDRESS, fullName: "Marie" },
      { ...ADDRESS, fullName: "Marie <script>" },
      { ...ADDRESS, phone: "0112345" },
      { ...ADDRESS, neighborhood: "Quartier inventé" },
      { ...ADDRESS, landmark: "ici" },
      { ...ADDRESS, landmark: "x".repeat(201) },
    ]) {
      expect(codeOf(() => validateAddress(bad, LIBREVILLE))).toBe("ADRESSE_INVALIDE");
    }
    expect(codeOf(() => validateAddress(ADDRESS, null))).toBe("ADRESSE_INVALIDE");
  });

  it("normalise l'Unicode et retire les caractères invisibles ou d'inversion du sens d'écriture", () => {
    const decomposed = "Glass".normalize("NFD");
    expect(validateAddress({ ...ADDRESS, neighborhood: decomposed }, LIBREVILLE).neighborhood).toBe(
      "Glass",
    );
    const akebe = { id: "x", name: "X", neighborhoods: ["Akébé"] };
    expect(
      validateAddress({ ...ADDRESS, neighborhood: "Akébé".normalize("NFD") }, akebe).neighborhood,
    ).toBe("Akébé");
    expect(
      validateAddress({ ...ADDRESS, landmark: "Portail\u202ebleu\u200b ici\u0085" }, LIBREVILLE)
        .landmark,
    ).toBe("Portail bleu ici");
  });

  it("retire les caractères de contrôle (texte imprimé sur l'étiquette)", () => {
    expect(
      validateAddress({ ...ADDRESS, landmark: "Portail\nbleu\u0000 ici" }, LIBREVILLE).landmark,
    ).toBe("Portail bleu ici");
  });
});

describe("montants (BR-004)", () => {
  const line = {
    variantId: "11111111-1111-4111-8111-111111111111",
    productId: "22222222-2222-4222-8222-222222222222",
    title: "Casque",
    variantName: "",
    image: null,
    unitPrice: 12_500,
    quantity: 2,
  };

  it("total de ligne et sous-total calculés ici", () => {
    const { lines, subtotal } = priceLines([
      line,
      { ...line, variantId: "x", unitPrice: 1_000, quantity: 3 },
    ]);
    expect(lines.map((l) => l.lineTotal)).toEqual([25_000, 3_000]);
    expect(subtotal).toBe(28_000);
  });

  it("panier vide ou prix invalide : refus", () => {
    expect(codeOf(() => priceLines([]))).toBe("PANIER_VIDE");
    expect(() => priceLines([{ ...line, unitPrice: 0 }])).toThrow(RangeError);
    expect(() => priceLines([{ ...line, unitPrice: 10.5 }])).toThrow(RangeError);
  });
});
