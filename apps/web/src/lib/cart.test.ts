import { describe, expect, it } from "vitest";
import {
  CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEYS,
  MAX_QTY_PER_LINE,
  cartCount,
  cartReducer,
  cartErrorMessage,
  cartSubtotal,
  emptyCart,
  fromServerCart,
  issueMessage,
  linesToMerge,
  parseStoredCart,
} from "./cart";

const VARIANT_NOIR = "2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a";
const VARIANT_BLEU = "3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b";
const PRODUCT = "0b9f1c7e-3f5a-4b8e-9c2d-1a2b3c4d5e6f";

const line = {
  variantId: VARIANT_NOIR,
  productId: PRODUCT,
  slug: "p1",
  title: "Produit 1",
  variantName: "Noir",
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
  it("deux variantes d'un même produit font deux lignes", () => {
    let s = cartReducer(emptyCart, { type: "add", line, quantity: 1 });
    s = cartReducer(s, {
      type: "add",
      line: { ...line, variantId: VARIANT_BLEU, variantName: "Bleu" },
      quantity: 2,
    });
    expect(s.lines.map((l) => [l.variantName, l.quantity])).toEqual([
      ["Noir", 1],
      ["Bleu", 2],
    ]);
    s = cartReducer(s, { type: "remove", variantId: VARIANT_NOIR });
    expect(s.lines.map((l) => l.variantName)).toEqual(["Bleu"]);
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
    s = cartReducer(s, { type: "setQuantity", variantId: VARIANT_NOIR, quantity: 3 });
    expect(cartCount(s)).toBe(3);
    expect(cartSubtotal(s)).toBe(30000);
    s = cartReducer(s, { type: "setQuantity", variantId: VARIANT_NOIR, quantity: -4 });
    expect(s.lines[0].quantity).toBe(1);
    expect(cartReducer(s, { type: "remove", variantId: VARIANT_NOIR }).lines).toHaveLength(0);
    expect(cartReducer(s, { type: "clear" })).toEqual(emptyCart);
  });
});

describe("parseStoredCart (donnée non fiable)", () => {
  it("restaure un panier valide", () => {
    const raw = JSON.stringify({ lines: [{ ...line, quantity: 2 }] });
    expect(parseStoredCart(raw).lines[0]).toMatchObject({
      variantId: VARIANT_NOIR,
      productId: PRODUCT,
      variantName: "Noir",
      quantity: 2,
    });
  });
  it("écarte les anciennes lignes (v1 : identifiant numérique, sans variante)", () => {
    const v1 = JSON.stringify({
      lines: [
        {
          productId: "38",
          slug: "p1",
          title: "Produit 1",
          price: 10000,
          image: null,
          quantity: 1,
          maxQuantity: 5,
        },
      ],
    });
    expect(parseStoredCart(v1)).toEqual(emptyCart);
    expect(
      parseStoredCart(JSON.stringify({ lines: [{ ...line, variantId: "38", quantity: 1 }] })).lines,
    ).toHaveLength(0);
  });
  it("nouvelle clé de stockage : l'ancien panier n'est jamais relu", () => {
    expect(CART_STORAGE_KEY).toBe("kemdia.cart.v2");
    expect(LEGACY_CART_STORAGE_KEYS).toContain("kemdia.cart.v1");
  });
  it("ignore JSON invalide, valeurs nulles, doublons et types inattendus", () => {
    expect(parseStoredCart(null)).toEqual(emptyCart);
    expect(parseStoredCart("{oops")).toEqual(emptyCart);
    expect(parseStoredCart('"texte"')).toEqual(emptyCart);
    expect(parseStoredCart(JSON.stringify({ lines: [{ productId: 1 }] })).lines).toHaveLength(0);
    const twice = JSON.stringify({
      lines: [
        { ...line, quantity: 1 },
        { ...line, quantity: 3 },
      ],
    });
    expect(parseStoredCart(twice).lines).toHaveLength(1);
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

describe("panier serveur (S5-T01)", () => {
  const serverLine = {
    variantId: VARIANT_NOIR,
    productId: PRODUCT,
    slug: "p1",
    title: "Produit 1",
    variantName: "Noir",
    image: "/images/products/p1.webp",
    price: 12_000,
    compareAtPrice: null,
    quantity: 2,
    maxQuantity: 20,
    ok: true,
  };

  it("fromServerCart : prix du serveur, ligne signalée quand elle n'est pas commandable", () => {
    const state = fromServerCart({
      lines: [
        serverLine,
        {
          ...serverLine,
          variantId: VARIANT_BLEU,
          ok: false,
          reason: "STOCK_INSUFFISANT",
          available: 1,
          maxQuantity: 1,
          image: "https://ailleurs.example/x.webp",
        },
      ],
      itemCount: 4,
      subtotal: 24_000,
      ok: false,
    });
    expect(state.lines[0]).toEqual({
      variantId: VARIANT_NOIR,
      productId: PRODUCT,
      slug: "p1",
      title: "Produit 1",
      variantName: "Noir",
      price: 12_000,
      image: "/images/products/p1.webp",
      quantity: 2,
      maxQuantity: 20,
    });
    expect(state.lines[1]).toMatchObject({
      issue: { reason: "STOCK_INSUFFISANT", available: 1 },
      image: null,
    });
    // Comme le serveur : la ligne signalée ne compte pas dans le total
    expect(cartSubtotal(state)).toBe(24_000);
  });

  it("linesToMerge : variante et quantité seulement, jamais de prix (BR-004)", () => {
    const s = cartReducer(emptyCart, { type: "add", line, quantity: 2 });
    expect(linesToMerge(s)).toEqual([{ variantId: VARIANT_NOIR, quantity: 2 }]);
  });

  it("messages en français pour chaque situation", () => {
    expect(issueMessage({ reason: "STOCK_INSUFFISANT", available: 2 })).toContain("Plus que 2");
    expect(issueMessage({ reason: "PRODUIT_INDISPONIBLE" })).toContain("Plus disponible");
    for (const code of [
      "PANIER_PLEIN",
      "PRODUIT_INDISPONIBLE",
      "VARIANTE_INCONNUE",
      "TROP_DE_REQUETES",
      "SESSION_INVALIDE",
      "INDISPONIBLE",
    ]) {
      expect(cartErrorMessage(code)).toMatch(/\.$/);
    }
    expect(cartErrorMessage("PANIER_PLEIN")).toContain("50");
  });
});

describe("identifiant de réunion (S5-T01)", () => {
  const MERGE_ID = "44444444-4444-4444-8444-444444444444";

  it("gardé à la relecture s'il est valable et que le panier n'est pas vide", () => {
    const raw = JSON.stringify({ lines: [{ ...line, quantity: 1 }], mergeId: MERGE_ID });
    expect(parseStoredCart(raw).mergeId).toBe(MERGE_ID);
    expect(
      parseStoredCart(JSON.stringify({ lines: [], mergeId: MERGE_ID })).mergeId,
    ).toBeUndefined();
    expect(
      parseStoredCart(JSON.stringify({ lines: [{ ...line, quantity: 1 }], mergeId: "x" })).mergeId,
    ).toBeUndefined();
  });

  it("toute modification du panier l'efface (le contenu n'est plus celui de la réunion)", () => {
    const state = { lines: [{ ...line, quantity: 1 }], mergeId: MERGE_ID };
    expect(
      cartReducer(state, { type: "setQuantity", variantId: VARIANT_NOIR, quantity: 2 }).mergeId,
    ).toBeUndefined();
    expect(cartReducer(state, { type: "remove", variantId: VARIANT_NOIR }).mergeId).toBeUndefined();
    expect(cartReducer(state, { type: "add", line, quantity: 1 }).mergeId).toBeUndefined();
  });
});
