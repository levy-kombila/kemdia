import { describe, expect, it } from "vitest";
import { ids, productProps, variantProps } from "../../../../test/catalog/fixtures.js";
import {
  ListingOffers,
  onOfferArchive,
  onOfferCreate,
  onOfferRestore,
  onOfferWithdraw,
  pickOffer,
  type OfferCandidate,
  type Seller,
} from "./listing.js";
import { Product } from "./product.js";
import type { ModerationState } from "./vendor-product.js";

const SHOP_A = "aaaaaaaa-0000-4000-8000-000000000001";
const SHOP_B = "bbbbbbbb-0000-4000-8000-000000000002";
const LIBREVILLE: Seller = { name: "A", slug: "a", city: "Libreville" };
const OYEM: Seller = { name: "B", slug: "b", city: "Oyem" };

function offer(id: string, shopId: string, price: number, stock: number): Product {
  return Product.create(
    productProps({
      id,
      slug: `offre-${id.slice(0, 4)}`,
      shopId,
      listingId: ids.product,
      listingSlug: "telephone-kemdia",
      variants: [
        variantProps({
          id: id.replace(/.$/, "f"),
          sku: `S-${id.slice(0, 4).toUpperCase()}`,
          listingVariantId: ids.v1,
          price,
          stock,
        }),
      ],
    }),
  );
}

const candidate = (p: Product, seller: Seller | null): OfferCandidate => ({
  offer: p,
  variant: p.variants[0]!,
  seller,
});

describe("Offre mise en avant (S7.5-T02, choix du 2026-10-20)", () => {
  const a = offer("a1000000-0000-4000-8000-000000000001", SHOP_A, 100_000, 0);
  const b = offer("b1000000-0000-4000-8000-000000000001", SHOP_B, 120_000, 4);

  it("en stock d'abord, même plus chère ; sans stock nulle part, la moins chère", () => {
    expect(pickOffer([candidate(a, LIBREVILLE), candidate(b, OYEM)])?.offer).toBe(b);
    const empty = offer("b2000000-0000-4000-8000-000000000001", SHOP_B, 120_000, 0);
    expect(pickOffer([candidate(empty, OYEM), candidate(a, LIBREVILLE)])?.offer).toBe(a);
  });

  it("à prix égal : la ville du client (accents et casse ignorés), puis l'identifiant", () => {
    const a2 = offer("a3000000-0000-4000-8000-000000000001", SHOP_A, 120_000, 1);
    const both = [candidate(b, OYEM), candidate(a2, LIBREVILLE)];
    expect(pickOffer(both, "oyem")?.offer).toBe(b);
    expect(pickOffer(both, "LIBREVILLE")?.offer).toBe(a2);
    expect(pickOffer(both)?.offer).toBe(a2);
    expect(pickOffer([...both].reverse())?.offer).toBe(a2);
    expect(pickOffer([])).toBeNull();
  });

  it("fiche : offres visibles seulement, variantes inactives ignorées, la mise en avant en tête", () => {
    const hidden = Product.create({
      ...productProps(),
      ...offer("c1000000-0000-4000-8000-000000000001", SHOP_A, 50_000, 9),
      variants: [...offer("c1000000-0000-4000-8000-000000000001", SHOP_A, 50_000, 9).variants],
      shopSuspended: true,
    });
    // Variante désactivée (moins chère) à côté d'une variante active : jamais proposée
    const base = offer("d1000000-0000-4000-8000-000000000001", SHOP_A, 200_000, 1);
    const inactive = Product.create({
      ...productProps(),
      ...base,
      variants: [
        ...base.variants,
        variantProps({
          id: "d1000000-0000-4000-8000-0000000000ee",
          sku: "S-D1EE",
          listingVariantId: ids.v1,
          price: 10_000,
          stock: 9,
          isActive: false,
        }),
      ],
    });
    const view = ListingOffers.build({
      content: {
        id: ids.product,
        slug: "telephone-kemdia",
        title: "Téléphone",
        description: "",
        brand: null,
        categoryId: ids.category,
        images: [],
        rating: 0,
        reviewCount: 0,
        isFeatured: false,
        isBestseller: false,
        isNew: false,
      },
      variants: [{ id: ids.v1, name: "Noir", attributes: {} }],
      offers: [a, hidden, inactive, b],
      sellers: new Map([
        [SHOP_A, LIBREVILLE],
        [SHOP_B, OYEM],
      ]),
    });
    expect(view?.main.offer).toBe(b);
    expect(view?.offers.map((o) => o.offer)).toEqual([b, inactive, a]);
    expect(view?.choices.map((c) => c.best.offer)).toEqual([b]);
    expect(view?.totalStock).toBe(5);
    expect(view?.inStock).toBe(true);
  });
});

describe("Statut d'une offre sur une fiche publiée (S7.5-T02)", () => {
  const published: ModerationState = {
    status: "PUBLISHED",
    moderationReason: null,
    submittedAt: null,
    reviewedBy: null,
    reviewedAt: null,
  };
  const now = new Date("2026-10-20T10:00:00Z");
  const moderator = "99999999-9999-4999-8999-999999999999";

  it("créée en ligne, sans modération", () => {
    expect(onOfferCreate()).toEqual(published);
  });

  it("retrait par l'équipe : refusée avec motif ; Kemdia : archivée (jamais « refusée »)", () => {
    const withdrawn = onOfferWithdraw(published, {
      moderatorId: moderator,
      reason: "Prix abusif",
      now,
      kemdia: false,
    });
    expect(withdrawn).toMatchObject({ status: "REJECTED", moderationReason: "Prix abusif" });
    expect(
      onOfferWithdraw(published, { moderatorId: moderator, reason: "x", now, kemdia: true }),
    ).toMatchObject({ status: "ARCHIVED", moderationReason: null });
    expect(() =>
      onOfferWithdraw(withdrawn, { moderatorId: moderator, reason: "x", now, kemdia: false }),
    ).toThrow(expect.objectContaining({ code: "STATUT_PRODUIT_INCOMPATIBLE" }));
  });

  it("une offre retirée ne s'archive pas et repasse par la modération pour revenir", () => {
    const withdrawn = onOfferWithdraw(published, {
      moderatorId: moderator,
      reason: "Contrefaçon",
      now,
      kemdia: false,
    });
    expect(() => onOfferArchive(withdrawn)).toThrow(
      expect.objectContaining({ code: "STATUT_PRODUIT_INCOMPATIBLE" }),
    );
    expect(onOfferRestore(withdrawn, now)).toMatchObject({ status: "PENDING", submittedAt: now });
  });

  it("archivée par son vendeur : de nouveau en ligne tout de suite", () => {
    const archived = onOfferArchive(published);
    expect(archived.status).toBe("ARCHIVED");
    expect(onOfferRestore(archived, now)).toEqual(published);
    expect(() => onOfferRestore(published, now)).toThrow(
      expect.objectContaining({ code: "STATUT_PRODUIT_INCOMPATIBLE" }),
    );
  });
});
