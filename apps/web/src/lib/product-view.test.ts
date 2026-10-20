import { describe, expect, it } from "vitest";
import type { ProductDetail } from "@kemdia/contracts";
import { currentOffer, otherOffers } from "./product-view";

/** Offres d'une fiche commune sur la page produit (S7.5-T03) : offre affichée et « Autres vendeurs ». */
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOIR = id(100);
const BLEU = id(101);

const line = (variantId: string, listingVariantId: string, price: number, stock = 2) => ({
  variantId,
  listingVariantId,
  name: listingVariantId === NOIR ? "Noir" : "Bleu",
  price,
  compareAtPrice: null,
  stock,
  available: stock > 0,
});

const product = {
  id: id(1),
  slug: "telephone",
  title: "Téléphone",
  images: ["/images/a.webp"],
  variants: [
    { id: id(11), name: "Noir" },
    { id: id(12), name: "Bleu" },
  ],
  offers: [
    {
      offerId: id(1),
      seller: { name: "A", slug: "a", city: "Libreville" },
      isMain: true,
      variants: [line(id(11), NOIR, 300_000), line(id(12), BLEU, 320_000)],
    },
    {
      offerId: id(2),
      seller: { name: "B", slug: "b", city: "Oyem" },
      isMain: false,
      variants: [line(id(21), NOIR, 310_000, 0)],
    },
    {
      offerId: id(3),
      seller: null,
      isMain: false,
      variants: [line(id(31), BLEU, 330_000)],
    },
  ],
} as unknown as ProductDetail;
const noir = product.variants[0]!;
const bleu = product.variants[1]!;

describe("offres d'une fiche (S7.5-T03)", () => {
  it("offre affichée : celle qui contient la variante choisie", () => {
    expect(currentOffer(product, noir)?.offerId).toBe(id(1));
    expect(currentOffer(product, { ...noir, id: id(99) })).toBeUndefined();
  });

  it("autres vendeurs : la même déclinaison seulement, avec leur propre variante pour le panier", () => {
    const others = otherOffers(product, noir);
    expect(others.map((o) => o.offer.offerId)).toEqual([id(2)]);
    expect(others[0]!.line).toMatchObject({
      variantId: id(21),
      productId: id(1),
      price: 310_000,
      variantName: "Noir",
      maxQuantity: 0,
    });
    expect(otherOffers(product, bleu).map((o) => o.line.variantId)).toEqual([id(31)]);
    expect(otherOffers(product, { ...noir, id: id(99) })).toEqual([]);
  });
});
