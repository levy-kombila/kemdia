import { describe, expect, it } from "vitest";
import { Cart, MAX_CART_LINES, MAX_LINE_QUANTITY, type StockOf } from "./cart.js";
import { OrdersError } from "./orders-error.js";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const stocks: Record<string, number> = { [A]: 5, [B]: 100, [C]: 0 };
const stockOf: StockOf = (id) => stocks[id] ?? (id.startsWith("v") ? 100 : null);
const variant = (i: number) => `v${String(i).padStart(3, "0")}`;

function codeOf(run: () => void): string | undefined {
  try {
    run();
  } catch (error) {
    return error instanceof OrdersError ? error.code : `autre : ${String(error)}`;
  }
  return undefined;
}

describe("Cart (panier serveur, S5-T01)", () => {
  it("ajoute une variante et additionne les quantités d'une variante déjà présente", () => {
    const cart = Cart.empty();
    cart.add(B, 2, stockOf);
    cart.add(B, 3, stockOf);
    expect(cart.items).toEqual([{ variantId: B, quantity: 5 }]);
  });

  it("ramène la quantité au stock et au maximum par ligne, sans erreur", () => {
    const cart = Cart.empty();
    cart.add(A, 4, stockOf);
    cart.add(A, 4, stockOf);
    expect(cart.quantityOf(A)).toBe(5);
    cart.setQuantity(B, MAX_LINE_QUANTITY, stockOf);
    cart.add(B, 1, stockOf);
    expect(cart.quantityOf(B)).toBe(MAX_LINE_QUANTITY);
  });

  it("BR-001 : refuse une variante inconnue ou sans stock", () => {
    const cart = Cart.empty();
    expect(codeOf(() => cart.add("99999999-9999-4999-8999-999999999999", 1, stockOf))).toBe(
      "VARIANTE_INCONNUE",
    );
    expect(codeOf(() => cart.add(C, 1, stockOf))).toBe("PRODUIT_INDISPONIBLE");
    expect(codeOf(() => cart.setQuantity(C, 1, stockOf))).toBe("PRODUIT_INDISPONIBLE");
    expect(cart.size).toBe(0);
  });

  it("refuse les quantités hors limites (0, négatives, décimales, plus de 20)", () => {
    const cart = Cart.empty();
    for (const q of [0, -1, 1.5, MAX_LINE_QUANTITY + 1, Number.NaN]) {
      expect(() => cart.add(B, q, stockOf)).toThrow(RangeError);
      expect(() => cart.setQuantity(B, q, stockOf)).toThrow(RangeError);
    }
  });

  it("fixe une quantité (crée la ligne si besoin), retire, vide", () => {
    const cart = Cart.restore([{ variantId: A, quantity: 1 }]);
    cart.setQuantity(A, 3, stockOf);
    cart.setQuantity(B, 2, stockOf);
    expect(cart.items).toEqual([
      { variantId: A, quantity: 3 },
      { variantId: B, quantity: 2 },
    ]);
    cart.remove(A);
    cart.remove(C); // absente : sans effet
    expect(cart.items).toEqual([{ variantId: B, quantity: 2 }]);
    cart.clear();
    expect(cart.size).toBe(0);
  });

  it(`refuse une ${MAX_CART_LINES + 1}e ligne (PANIER_PLEIN) mais accepte de modifier une ligne existante`, () => {
    const cart = Cart.empty();
    for (let i = 0; i < MAX_CART_LINES; i++) cart.add(variant(i), 1, stockOf);
    expect(codeOf(() => cart.add(variant(999), 1, stockOf))).toBe("PANIER_PLEIN");
    expect(codeOf(() => cart.setQuantity(variant(999), 1, stockOf))).toBe("PANIER_PLEIN");
    cart.add(variant(0), 2, stockOf);
    expect(cart.quantityOf(variant(0))).toBe(3);
    expect(cart.size).toBe(MAX_CART_LINES);
  });

  describe("réunion avec le panier du navigateur (choix : additionner)", () => {
    it("additionne les quantités, ajoute les nouvelles lignes à la fin", () => {
      const cart = Cart.restore([{ variantId: B, quantity: 2 }]);
      const { ignored } = cart.merge(
        [
          { variantId: A, quantity: 1 },
          { variantId: B, quantity: 3 },
        ],
        stockOf,
      );
      expect(ignored).toBe(0);
      expect(cart.items).toEqual([
        { variantId: B, quantity: 5 },
        { variantId: A, quantity: 1 },
      ]);
    });

    it("borne au stock et au maximum, ignore (sans échouer) l'indisponible, l'inconnu et les doublons", () => {
      const cart = Cart.restore([{ variantId: A, quantity: 4 }]);
      const { ignored } = cart.merge(
        [
          { variantId: A, quantity: 4 },
          { variantId: C, quantity: 1 },
          { variantId: "99999999-9999-4999-8999-999999999999", quantity: 1 },
          { variantId: B, quantity: 20 },
          { variantId: B, quantity: 20 },
        ],
        stockOf,
      );
      expect(ignored).toBe(3);
      expect(cart.items).toEqual([
        { variantId: A, quantity: 5 },
        { variantId: B, quantity: 20 },
      ]);
    });

    it("ne dépasse jamais 50 lignes : le surplus est ignoré, les lignes déjà présentes sont additionnées", () => {
      const cart = Cart.empty();
      for (let i = 0; i < MAX_CART_LINES - 1; i++) cart.add(variant(i), 1, stockOf);
      const { ignored } = cart.merge(
        [
          { variantId: variant(500), quantity: 1 },
          { variantId: variant(501), quantity: 1 },
          { variantId: variant(0), quantity: 1 },
        ],
        stockOf,
      );
      expect(ignored).toBe(1);
      expect(cart.size).toBe(MAX_CART_LINES);
      expect(cart.quantityOf(variant(0))).toBe(2);
      expect(cart.quantityOf(variant(501))).toBe(0);
    });
  });
});
