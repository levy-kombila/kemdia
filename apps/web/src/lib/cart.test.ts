import { describe, expect, it } from "vitest";
import {
  MAX_QTY_PER_LINE,
  cartCount,
  cartReducer,
  cartSubtotal,
  emptyCart,
  parseStoredCart,
} from "./cart";

const line = {
  productId: "1",
  slug: "p1",
  title: "Produit 1",
  price: 10000,
  image: "/images/products/p1.webp",
  maxQuantity: 5,
};

describe("cartReducer", () => {
  it("ajoute puis cumule les quantités, borné par le stock", () => {
    let s = cartReducer(emptyCart, { type: "add", line, quantity: 2 });
    s = cartReducer(s, { type: "add", line, quantity: 10 });
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0].quantity).toBe(5);
  });
  it("borne aussi par MAX_QTY_PER_LINE", () => {
    const s = cartReducer(emptyCart, {
      type: "add",
      line: { ...line, maxQuantity: 1000 },
      quantity: 500,
    });
    expect(s.lines[0].quantity).toBe(MAX_QTY_PER_LINE);
  });
  it("n'ajoute pas un produit en rupture", () => {
    expect(
      cartReducer(emptyCart, { type: "add", line: { ...line, maxQuantity: 0 }, quantity: 1 }),
    ).toBe(emptyCart);
  });
  it("modifie, supprime et vide", () => {
    let s = cartReducer(emptyCart, { type: "add", line, quantity: 1 });
    s = cartReducer(s, { type: "setQuantity", productId: "1", quantity: 3 });
    expect(cartCount(s)).toBe(3);
    expect(cartSubtotal(s)).toBe(30000);
    s = cartReducer(s, { type: "setQuantity", productId: "1", quantity: -4 });
    expect(s.lines[0].quantity).toBe(1);
    expect(cartReducer(s, { type: "remove", productId: "1" }).lines).toHaveLength(0);
    expect(cartReducer(s, { type: "clear" })).toEqual(emptyCart);
  });
});

describe("parseStoredCart (donnée non fiable)", () => {
  it("restaure un panier valide", () => {
    const raw = JSON.stringify({ lines: [{ ...line, quantity: 2 }] });
    expect(parseStoredCart(raw).lines[0]).toMatchObject({ productId: "1", quantity: 2 });
  });
  it("ignore JSON invalide, valeurs nulles et types inattendus", () => {
    expect(parseStoredCart(null)).toEqual(emptyCart);
    expect(parseStoredCart("{oops")).toEqual(emptyCart);
    expect(parseStoredCart('"texte"')).toEqual(emptyCart);
    expect(parseStoredCart(JSON.stringify({ lines: [{ productId: 1 }] })).lines).toHaveLength(0);
  });
  it("neutralise une image hors de /images/ (ex. javascript: ou domaine externe)", () => {
    const raw = JSON.stringify({
      lines: [{ ...line, image: "https://evil.example/x.png", quantity: 1 }],
    });
    expect(parseStoredCart(raw).lines[0].image).toBeNull();
  });
  it("borne une quantité trafiquée", () => {
    const raw = JSON.stringify({ lines: [{ ...line, quantity: 99999 }] });
    expect(parseStoredCart(raw).lines[0].quantity).toBe(5);
  });
});
