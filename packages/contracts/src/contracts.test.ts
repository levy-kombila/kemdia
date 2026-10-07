import { describe, expect, it } from "vitest";
import {
  MAX_PAGE_SIZE,
  PRICE_RANGES,
  ProductSummarySchema,
  SignupRequestSchema,
  SignupVerifyRequestSchema,
  openApiComponentSchemas,
  productQueryParams,
} from "./index.js";
import { demoCatalog, demoIds, uuidV5 } from "./demo/index.js";

describe("constantes", () => {
  it("les tranches de prix se suivent sans trou ni chevauchement", () => {
    PRICE_RANGES.forEach((range, i) => {
      const next = PRICE_RANGES[i + 1];
      expect(range.min).toBeLessThanOrEqual(range.max);
      if (next) expect(next.min).toBe(range.max + 1);
    });
  });
});

describe("productQueryParams", () => {
  it("construit les paramètres dans un ordre fixe, sans valeurs vides", () => {
    const params = productQueryParams({
      badge: "new",
      category: "high-tech",
      q: "  écouteurs ",
      brands: ["Apple", "Samsung"],
      inStock: true,
      onlyDeals: false,
      pageSize: MAX_PAGE_SIZE,
    });
    expect(params.toString()).toBe(
      "category=high-tech&q=%C3%A9couteurs&pageSize=48&brands=Apple%2CSamsung&inStock=1&badge=new",
    );
    expect(productQueryParams({}).toString()).toBe("");
  });
});

describe("schémas", () => {
  const summary = {
    id: demoIds.product("telephone"),
    slug: "telephone",
    title: "Téléphone",
    brand: null,
    categoryId: demoIds.category("high-tech"),
    image: "/images/products/telephone.webp",
    price: 150_000,
    compareAtPrice: null,
    inStock: true,
    variantId: demoIds.variant("telephone"),
    stock: 3,
    variantCount: 1,
    rating: 4.5,
    reviewCount: 12,
    isFeatured: false,
    isBestseller: true,
    isNew: false,
  };

  it("acceptent une réponse conforme", () => {
    expect(ProductSummarySchema.parse(summary)).toEqual(summary);
  });

  it("refusent un prix non entier ou un identifiant qui n'est pas un UUID (BR-004, BR-042)", () => {
    expect(ProductSummarySchema.safeParse({ ...summary, price: 1500.5 }).success).toBe(false);
    expect(ProductSummarySchema.safeParse({ ...summary, id: "38" }).success).toBe(false);
  });

  it("sont tous exportés pour la documentation OpenAPI", () => {
    expect(Object.keys(openApiComponentSchemas())).toEqual([
      "AvailabilityRequest",
      "AvailabilityResponse",
      "Category",
      "CategoryNode",
      "CategoryTree",
      "CategoryView",
      "Facets",
      "Health",
      "ProblemDetails",
      "ProductDetail",
      "ProductPage",
      "ProductSummary",
      "SignupRequest",
      "SignupResendRequest",
      "SignupStarted",
      "SignupVerified",
      "SignupVerifyRequest",
      "Variant",
    ]);
  });

  it("inscription : conditions acceptées obligatoires, champs inconnus refusés, code à 6 chiffres", () => {
    const body = {
      firstName: "Awa",
      lastName: "Ndong",
      identifier: "awa@exemple.ga",
      password: "Mangue2026",
    };
    expect(SignupRequestSchema.safeParse({ ...body, acceptTerms: true }).success).toBe(true);
    expect(SignupRequestSchema.safeParse({ ...body, acceptTerms: false }).success).toBe(false);
    expect(
      SignupRequestSchema.safeParse({ ...body, acceptTerms: true, role: "admin" }).success,
    ).toBe(false);
    const ticket = "a".repeat(43);
    expect(SignupVerifyRequestSchema.safeParse({ ticket, code: "042917" }).success).toBe(true);
    expect(SignupVerifyRequestSchema.safeParse({ ticket, code: "42917" }).success).toBe(false);
    expect(SignupVerifyRequestSchema.safeParse({ ticket: "court", code: "042917" }).success).toBe(
      false,
    );
  });
});

describe("données de démonstration", () => {
  it("UUID v5 conforme à la norme (exemple de la RFC 9562)", () => {
    expect(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe(
      "2ed6657d-e927-568b-95e1-2665a8aea6a2",
    );
  });

  it("identifiants stables (mêmes valeurs que celles déjà importées dans les bases)", () => {
    expect(demoIds.product("ecouteurs-sans-fil-pro-beats-noir")).toBe(
      "fb3a8b99-8ac4-56cf-8617-f415fd9e233a",
    );
    expect(demoIds.category("high-tech")).toBe("eee45e1f-ddb8-573a-9572-614acf66871d");
    expect(demoIds.sku("telephone")).toMatch(/^KMD-[0-9A-F]{10}$/);
  });

  it("112 catégories et 50 produits", () => {
    expect(demoCatalog.categories).toHaveLength(112);
    expect(demoCatalog.products).toHaveLength(50);
  });
});
