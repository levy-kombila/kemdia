import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  MAX_PAGE_SIZE,
  PRICE_RANGES,
  ProductSummarySchema,
  SignupRequestSchema,
  SignupVerifyRequestSchema,
  AdminRoleParamsSchema,
  AuditQueryParamsSchema,
  AccountViewSchema,
  CART_ERROR_CODES,
  CART_MAX_LINES,
  CART_MAX_QUANTITY,
  CartAddRequestSchema,
  CartMergeRequestSchema,
  ProblemDetailsSchema,
  CreateOrderRequestSchema,
  ORDER_ERROR_CODES,
  COUPON_CODE_PATTERN,
  COUPON_ERROR_CODES,
  CouponCreateRequestSchema,
  ORDER_REFERENCE_ALPHABET,
  ORDER_REFERENCE_PATTERN,
  openApiComponentSchemas,
  productQueryParams,
  KEMDIA_SHOP_ID,
  ShopApplicationRequestSchema,
  ShopIdParamsSchema,
  ShopListParamsSchema,
  VENDOR_ERROR_CODES,
  VendorProductCreateRequestSchema,
  VendorVariantUpdateRequestSchema,
} from "./index.js";
import { demoCatalog, demoIds, uuidV5 } from "./demo/index.js";
import {
  CITIES,
  ZONES,
  codAvailability,
  estimateDelivery,
  getCity,
  OTHER_NEIGHBORHOOD,
} from "./delivery.js";

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
      "AccountView",
      "AdminAccount",
      "AdminAccountLookupRequest",
      "AdminCancelOrderRequest",
      "AdminShop",
      "AdminShopPage",
      "AuditEvent",
      "AuditPage",
      "AvailabilityRequest",
      "AvailabilityResponse",
      "BillingSettings",
      "BillingSettingsRequest",
      "Cart",
      "CartAddRequest",
      "CartLine",
      "CartMerged",
      "CartMergeRequest",
      "CartQuantityRequest",
      "Category",
      "CategoryNode",
      "CategoryTree",
      "CategoryView",
      "CodCollectedRequest",
      "CodSettings",
      "CodSettingsRequest",
      "Coupon",
      "CouponCreateRequest",
      "CouponPage",
      "CouponUpdateRequest",
      "CreateOrderRequest",
      "CurrentSession",
      "DeliveryAddress",
      "Facets",
      "ForgotPasswordRequest",
      "Health",
      "InvoiceList",
      "InvoiceSummary",
      "LoginRequest",
      "LogoutAll",
      "ModerationProduct",
      "ModerationProductPage",
      "OpenedSession",
      "Order",
      "OrderLine",
      "OrderPage",
      "OrderQuote",
      "OrderQuoteRequest",
      "OrderSummary",
      "Payment",
      "PaymentNotification",
      "PaymentNotificationAck",
      "ProblemDetails",
      "ProductApproval",
      "ProductDetail",
      "ProductModerationReason",
      "ProductPage",
      "ProductSummary",
      "RecoveryCodes",
      "Refund",
      "RefundDoneRequest",
      "RefundPage",
      "ResetPasswordRequest",
      "ResetResendRequest",
      "ResetStarted",
      "SandboxDecision",
      "SandboxDecisionRequest",
      "SandboxPaymentRequest",
      "SandboxPaymentRequestPage",
      "SecondFactorCodeRequest",
      "SecondFactorEnabled",
      "SecondFactorSetup",
      "SecondFactorSetupRequest",
      "SecondFactorStatus",
      "SecondFactorVerified",
      "Shop",
      "ShopApplicationRequest",
      "ShopDecisionReason",
      "SignupRequest",
      "SignupResendRequest",
      "SignupStarted",
      "SignupVerified",
      "SignupVerifyRequest",
      "StartPaymentRequest",
      "Variant",
      "VendorProduct",
      "VendorProductContentRequest",
      "VendorProductCreateRequest",
      "VendorProductPage",
      "VendorVariant",
      "VendorVariantInput",
      "VendorVariantUpdateRequest",
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

describe("rôles et journal d'audit (S4-T06)", () => {
  const id = "0b9c2f5e-3c1a-4d2b-9e8f-1a2b3c4d5e6f";

  it("seuls « vendor » et « moderator » sont attribuables par l'API (jamais « admin »)", () => {
    expect(AdminRoleParamsSchema.safeParse({ accountId: id, role: "vendor" }).success).toBe(true);
    expect(AdminRoleParamsSchema.safeParse({ accountId: id, role: "moderator" }).success).toBe(
      true,
    );
    expect(AdminRoleParamsSchema.safeParse({ accountId: id, role: "admin" }).success).toBe(false);
    expect(AdminRoleParamsSchema.safeParse({ accountId: "42", role: "vendor" }).success).toBe(
      false,
    );
  });

  it("compte : rôles connus seulement", () => {
    const account = { id, firstName: "Awa", lastName: "Ndong", email: null, phone: null };
    expect(AccountViewSchema.safeParse({ ...account, roles: ["client", "admin"] }).success).toBe(
      true,
    );
    expect(AccountViewSchema.safeParse({ ...account, roles: ["root"] }).success).toBe(false);
  });

  it("journal : 50 lignes par défaut, 100 au plus, action connue, paramètres inconnus refusés", () => {
    expect(AuditQueryParamsSchema.parse({})).toEqual({ limit: 50 });
    expect(AuditQueryParamsSchema.parse({ limit: "20", action: "role.granted" })).toEqual({
      limit: 20,
      action: "role.granted",
    });
    expect(AuditQueryParamsSchema.safeParse({ limit: "500" }).success).toBe(false);
    expect(AuditQueryParamsSchema.safeParse({ action: "tout" }).success).toBe(false);
    expect(AuditQueryParamsSchema.safeParse({ before: "x'; DROP" }).success).toBe(false);
    expect(AuditQueryParamsSchema.safeParse({ sql: "1" }).success).toBe(false);
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

describe("panier (S5-T01)", () => {
  const variantId = "0b5a3c3e-5a1b-4c1e-9f1a-2b3c4d5e6f70";

  it("n'accepte que des variantes et des quantités entières de 1 à 20 (jamais de prix)", () => {
    expect(CartAddRequestSchema.safeParse({ variantId, quantity: 2 }).success).toBe(true);
    expect(CartAddRequestSchema.safeParse({ variantId, quantity: 0 }).success).toBe(false);
    expect(
      CartAddRequestSchema.safeParse({ variantId, quantity: CART_MAX_QUANTITY + 1 }).success,
    ).toBe(false);
    expect(CartAddRequestSchema.safeParse({ variantId, quantity: 1.5 }).success).toBe(false);
    expect(CartAddRequestSchema.safeParse({ variantId, quantity: 1, price: 10 }).success).toBe(
      false,
    );
    expect(CartAddRequestSchema.safeParse({ variantId: "38", quantity: 1 }).success).toBe(false);
  });

  it("réunion : 50 lignes au plus, prix refusé", () => {
    const line = { variantId, quantity: 1 };
    const mergeId = "4c5d6e7f-8a9b-4c0d-8e1f-2a3b4c5d6e7f";
    expect(CartMergeRequestSchema.safeParse({ mergeId, lines: [line] }).success).toBe(true);
    expect(CartMergeRequestSchema.safeParse({ mergeId, lines: [] }).success).toBe(true);
    // Sans identifiant de réunion : refusé (une réunion répétée doublerait les quantités)
    expect(CartMergeRequestSchema.safeParse({ lines: [line] }).success).toBe(false);
    expect(
      CartMergeRequestSchema.safeParse({ mergeId, lines: Array(CART_MAX_LINES + 1).fill(line) })
        .success,
    ).toBe(false);
    expect(
      CartMergeRequestSchema.safeParse({ mergeId, lines: [{ ...line, price: 1 }] }).success,
    ).toBe(false);
  });

  it("les codes d'erreur du panier sont des codes de l'API", () => {
    for (const code of CART_ERROR_CODES) {
      expect(
        ProblemDetailsSchema.safeParse({ type: "about:blank", title: "x", status: 422, code })
          .success,
      ).toBe(true);
    }
  });
});

describe("commandes (S5-T02)", () => {
  const order = {
    idempotencyKey: randomUUID(),
    expectedTotal: 12_000,
    delivery: {
      fullName: "Marie Nze",
      phone: "+241077123456",
      cityId: "libreville",
      neighborhood: "Glass",
      landmark: "Portail bleu",
    },
    payment: { method: "airtel", phone: "+241077123456" },
  };

  it("une commande ne contient ni article ni prix : seulement l'adresse, le paiement et le total attendu", () => {
    expect(CreateOrderRequestSchema.safeParse(order).success).toBe(true);
    expect(CreateOrderRequestSchema.safeParse({ ...order, items: [] }).success).toBe(false);
    expect(CreateOrderRequestSchema.safeParse({ ...order, total: 1 }).success).toBe(false);
    expect(
      CreateOrderRequestSchema.safeParse({ ...order, payment: { method: "visa" } }).success,
    ).toBe(false);
    expect(CreateOrderRequestSchema.safeParse({ ...order, expectedTotal: 10.5 }).success).toBe(
      false,
    );
    expect(
      CreateOrderRequestSchema.safeParse({ ...order, idempotencyKey: undefined }).success,
    ).toBe(false);
  });

  it("numéro de commande : KMD- et 6 caractères sans 0, O, 1 ni I", () => {
    expect(ORDER_REFERENCE_ALPHABET).not.toMatch(/[0O1I]/);
    expect(ORDER_REFERENCE_ALPHABET).toHaveLength(32);
    expect(ORDER_REFERENCE_PATTERN.test("KMD-7F3K9Q")).toBe(true);
    for (const bad of ["KMD-7F3K9", "KMD-7F3K9O", "kmd-7f3k9q", "KMD-000123"])
      expect(ORDER_REFERENCE_PATTERN.test(bad)).toBe(false);
  });

  it("les codes d'erreur des commandes sont des codes de l'API", () => {
    for (const code of ORDER_ERROR_CODES) {
      expect(
        ProblemDetailsSchema.safeParse({ type: "about:blank", title: "x", status: 409, code })
          .success,
      ).toBe(true);
    }
  });
});

describe("livraison (barèmes partagés, S5-T02)", () => {
  it("13 villes, chacune dans une zone connue, sans quartier « Autre » en double", () => {
    expect(CITIES).toHaveLength(13);
    for (const city of CITIES) {
      expect(ZONES[city.zone]).toBeDefined();
      expect(city.neighborhoods).not.toContain(OTHER_NEIGHBORHOOD);
    }
    expect(getCity("inconnue")).toBeUndefined();
  });

  it("frais : base de la zone + supplément de la ville, offerts au-delà du seuil", () => {
    expect(estimateDelivery("libreville", 10_000)?.fee).toBe(0);
    expect(estimateDelivery("franceville", 10_000)?.fee).toBe(2_500);
    expect(estimateDelivery("franceville", 50_000)?.fee).toBe(0);
    expect(estimateDelivery("makokou", 1_000)?.fee).toBe(4_000);
    expect(estimateDelivery("inconnue", 1_000)).toBeNull();
  });

  it("paiement à la livraison : Grand Libreville, 100 000 FCFA au plus (valeurs provisoires)", () => {
    expect(codAvailability("libreville", 100_000)).toEqual({ allowed: true });
    expect(codAvailability("libreville", 100_001).allowed).toBe(false);
    expect(codAvailability("port-gentil", 1_000).allowed).toBe(false);
    // Réglage de l'administrateur (S5-T04) : zones et total maximum
    const rule = { zones: ["zone_1", "zone_2"] as const, maxTotal: 250_000 };
    expect(codAvailability("port-gentil", 200_000, rule)).toEqual({ allowed: true });
    expect(codAvailability("libreville", 250_001, rule)).toEqual({
      allowed: false,
      reason: "Disponible pour les commandes jusqu'à 250 000 FCFA.",
    });
    expect(codAvailability("libreville", 1_000, { zones: [], maxTotal: 250_000 }).allowed).toBe(
      false,
    );
  });
});

describe("barèmes gelés (S5-T02)", () => {
  it("aucun code ne peut modifier un tarif ou une ville en cours de route", () => {
    expect(Object.isFrozen(ZONES)).toBe(true);
    expect(Object.isFrozen(ZONES.zone_1)).toBe(true);
    expect(Object.isFrozen(CITIES)).toBe(true);
    expect(Object.isFrozen(CITIES[0]!.neighborhoods)).toBe(true);
    expect(() => {
      (ZONES.zone_1 as { baseFee: number }).baseFee = 0;
    }).toThrow(TypeError);
  });
});

describe("coupons (S5-T03)", () => {
  it("code : 4 à 20 lettres, chiffres ou tirets, sans casse", () => {
    for (const ok of ["NOEL", "bienvenue10", "SOLDES-2026", "A".repeat(20)])
      expect(COUPON_CODE_PATTERN.test(ok)).toBe(true);
    for (const bad of ["ABC", "A".repeat(21), "-NOEL", "NOEL-", "NO EL", "NOËL", "NOEL;DROP"])
      expect(COUPON_CODE_PATTERN.test(bad)).toBe(false);
  });

  it("création : type et valeur obligatoires, champs inconnus refusés", () => {
    expect(
      CouponCreateRequestSchema.safeParse({ code: "NOEL", kind: "percent", value: 10 }).success,
    ).toBe(true);
    expect(
      CouponCreateRequestSchema.safeParse({ code: "NOEL", kind: "gift", value: 10 }).success,
    ).toBe(false);
    expect(
      CouponCreateRequestSchema.safeParse({ code: "NOEL", kind: "fixed", value: 10.5 }).success,
    ).toBe(false);
    expect(
      CouponCreateRequestSchema.safeParse({ code: "NOEL", kind: "fixed", value: 500, usedCount: 0 })
        .success,
    ).toBe(false);
  });

  it("les codes d'erreur des coupons sont des codes de l'API", () => {
    for (const code of COUPON_ERROR_CODES) {
      expect(
        ProblemDetailsSchema.safeParse({ type: "about:blank", title: "x", status: 422, code })
          .success,
      ).toBe(true);
    }
  });
});

describe("Boutiques (S6-T01)", () => {
  const valid = {
    name: "Chez Ali",
    city: "Libreville",
    phone: "077 12 34 56",
    description: "Téléphones et accessoires d'origine.",
  };

  it("une demande n'a que ses quatre champs (jamais de statut ni de propriétaire)", () => {
    expect(ShopApplicationRequestSchema.safeParse(valid).success).toBe(true);
    expect(ShopApplicationRequestSchema.safeParse({ ...valid, status: "active" }).success).toBe(
      false,
    );
    expect(
      ShopApplicationRequestSchema.safeParse({ ...valid, ownerAccountId: randomUUID() }).success,
    ).toBe(false);
    expect(
      ShopApplicationRequestSchema.safeParse({ ...valid, name: "x".repeat(121) }).success,
    ).toBe(false);
  });

  it("identifiant de boutique ramené en minuscules ; file filtrée par statut connu", () => {
    const id = randomUUID();
    expect(ShopIdParamsSchema.parse({ shopId: id.toUpperCase() }).shopId).toBe(id);
    expect(ShopListParamsSchema.safeParse({ status: "pending" }).success).toBe(true);
    expect(ShopListParamsSchema.safeParse({ status: "deleted" }).success).toBe(false);
    expect(ShopListParamsSchema.parse({}).limit).toBe(50);
  });

  it("la boutique Kemdia a un UUID valide ; les codes d'erreur des boutiques sont des codes de l'API", () => {
    expect(ShopIdParamsSchema.safeParse({ shopId: KEMDIA_SHOP_ID }).success).toBe(true);
    for (const code of VENDOR_ERROR_CODES) {
      expect(
        ProblemDetailsSchema.safeParse({ type: "about:blank", title: "x", status: 409, code })
          .success,
      ).toBe(true);
    }
  });
});

describe("Produits des vendeurs (S6-T02)", () => {
  const variant = { name: "Rouge", price: 5_000, stock: 3 };
  const product = {
    title: "Pagne wax",
    description: "Pagne wax 100 % coton.",
    categoryId: randomUUID(),
    variants: [variant],
  };

  it("une création n'a ni statut, ni boutique, ni référence de variante", () => {
    expect(VendorProductCreateRequestSchema.safeParse(product).success).toBe(true);
    expect(
      VendorProductCreateRequestSchema.safeParse({ ...product, status: "published" }).success,
    ).toBe(false);
    expect(
      VendorProductCreateRequestSchema.safeParse({ ...product, shopId: randomUUID() }).success,
    ).toBe(false);
    expect(
      VendorProductCreateRequestSchema.safeParse({
        ...product,
        variants: [{ ...variant, sku: "X-1" }],
      }).success,
    ).toBe(false);
    expect(VendorProductCreateRequestSchema.safeParse({ ...product, variants: [] }).success).toBe(
      false,
    );
  });

  it("variante : stock et stock lu vont ensemble ; prix entier positif ; rien à modifier refusé", () => {
    expect(VendorVariantUpdateRequestSchema.safeParse({ stock: 4, previousStock: 3 }).success).toBe(
      true,
    );
    expect(VendorVariantUpdateRequestSchema.safeParse({ stock: 4 }).success).toBe(false);
    expect(VendorVariantUpdateRequestSchema.safeParse({ price: 10.5 }).success).toBe(false);
    expect(VendorVariantUpdateRequestSchema.safeParse({ price: 0 }).success).toBe(false);
    expect(VendorVariantUpdateRequestSchema.safeParse({}).success).toBe(false);
  });
});
