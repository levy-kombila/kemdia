import { describe, expect, it } from "vitest";
import type { AuditEntry } from "../../audit/index.js";
import { CatalogError, type VendorProductRecord } from "../../catalog/index.js";
import type { Shop, ShopStatus } from "../domain/shop.js";
import type { ShopRepository, VendorsTransaction } from "./ports.js";
import { ProductModerationService } from "./product-moderation.service.js";
import { VendorProductService, type VendorCatalogPort } from "./vendor-product.service.js";

const AWA = "11111111-1111-4111-8111-111111111111";
const MODO = "22222222-2222-4222-8222-222222222222";
const SHOP = "33333333-3333-4333-8333-333333333333";
const PRODUCT = "44444444-4444-4444-8444-444444444444";
const IMAGE = "77777777-7777-4777-8777-777777777777";
const CTX = { ip: null, requestId: "req-1" };
const PROCESSED = {
  large: new Uint8Array(),
  small: new Uint8Array(),
  width: 800,
  height: 600,
  sha256: "a".repeat(64),
};
const STORED = {
  id: IMAGE,
  productId: PRODUCT,
  bytes: new Uint8Array([1]),
  sha256: "a".repeat(64),
};
const NOW = new Date("2026-10-16T08:00:00.000Z");

const shopOf = (status: ShopStatus, owner = AWA): Shop => ({
  id: SHOP,
  kind: "partner",
  ownerAccountId: owner,
  name: "Chez Awa",
  nameKey: "chez awa",
  slug: "chez-awa",
  city: "Libreville",
  contactPhone: "+241066123456",
  description: "Pagnes et robes cousus à Libreville.",
  status,
  statusReason: status === "suspended" ? "Motif" : null,
  reviewedBy: null,
  reviewedAt: null,
  submittedAt: NOW,
  createdAt: NOW,
});

const VARIANT = {
  id: "66666666-6666-4666-8666-666666666666",
  sku: "VAB12CD34-1",
  name: "Rouge",
  attributes: {},
  price: 5_000,
  compareAtPrice: null,
  stock: 3,
  isActive: true,
};

const product = (status: VendorProductRecord["status"] = "PENDING"): VendorProductRecord => ({
  id: PRODUCT,
  shopId: SHOP,
  slug: "pagne-wax-ab12cd",
  title: "Pagne wax 6 yards",
  description: "Pagne wax 100 % coton, 6 yards, motifs variés.",
  brand: null,
  categoryId: "55555555-5555-4555-8555-555555555555",
  images: [],
  status,
  moderationReason: null,
  submittedAt: NOW,
  reviewedBy: null,
  reviewedAt: null,
  shopSuspended: false,
  createdAt: NOW,
  updatedAt: NOW,
  variants: [VARIANT],
});

function setup(shop: Shop | null) {
  const audit: AuditEntry[] = [];
  const calls: string[] = [];
  const shops = {
    shareLockByOwner: (owner: string) => {
      calls.push(`verrou partagé ${owner}`);
      return Promise.resolve(shop && shop.ownerAccountId === owner ? shop : null);
    },
    findById: (id: string) => Promise.resolve(shop?.id === id ? shop : null),
    findByOwner: (owner: string) => {
      calls.push(`lecture ${owner}`);
      return Promise.resolve(shop && shop.ownerAccountId === owner ? shop : null);
    },
  } as unknown as ShopRepository;
  const tx: VendorsTransaction = { run: (work) => work() };
  const record = { record: (entry: AuditEntry) => Promise.resolve(void audit.push(entry)) };
  const catalog: VendorCatalogPort = {
    create: (shopId) => {
      calls.push(`créer pour ${shopId}`);
      return Promise.resolve(product());
    },
    get: () => Promise.resolve(product()),
    list: () => Promise.resolve({ items: [], next: null }),
    updateContent: () =>
      Promise.resolve({ before: product("PUBLISHED"), after: product("PENDING") }),
    updateVariant: (_shop, _product, _variant, patch) =>
      Promise.resolve({
        before: VARIANT,
        after: { ...product("PUBLISHED"), variants: [{ ...VARIANT, ...patch }] },
      }),
    archive: () => Promise.resolve({ before: product("PUBLISHED"), after: product("ARCHIVED") }),
    restore: () => Promise.resolve(product("PENDING")),
    prepareImage: () => {
      calls.push("réencodage");
      return Promise.resolve(PROCESSED);
    },
    addImage: () => {
      calls.push("ranger la photo");
      return Promise.resolve({
        before: product("PUBLISHED"),
        after: { ...product("PENDING"), images: [`/images/v/${IMAGE}.webp`] },
        imageId: IMAGE,
      });
    },
    removeImage: () => Promise.resolve(product("PUBLISHED")),
    reorderImages: () => Promise.resolve(product("PUBLISHED")),
    ownImage: () => Promise.resolve(STORED),
  };
  const vendor = new VendorProductService(shops, tx, record, catalog);
  vendor.clock = () => NOW;
  const moderation = new ProductModerationService(shops, tx, record, {
    moderationQueue: () => Promise.resolve({ items: [product()], next: null }),
    moderationGet: () => Promise.resolve(product()),
    lockForModeration: () => Promise.resolve(product()),
    moderate: (locked, decision, by) =>
      Promise.resolve({
        ...locked,
        status: decision === "approve" ? "PUBLISHED" : "REJECTED",
        moderationReason: by.reason,
        reviewedBy: by.moderatorId,
        reviewedAt: by.now,
      }),
    moderationImage: () => Promise.resolve(STORED),
  });
  moderation.clock = () => NOW;
  return { vendor, moderation, audit, calls };
}

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => "aucune erreur",
    (error: { code?: string }) => error.code,
  );

const INPUT = {
  title: "Pagne wax",
  description: "Pagne wax 100 % coton, 6 yards.",
  categoryId: "55555555-5555-4555-8555-555555555555",
  variants: [{ name: "Rouge", price: 5_000, stock: 3 }],
};

describe("VendorProductService (S6-T02)", () => {
  it("boutique active : écrit pour SA boutique, sous verrou partagé, et trace l'envoi en modération", async () => {
    const { vendor, audit, calls } = setup(shopOf("active"));
    await vendor.create(AWA, INPUT, CTX);
    expect(calls).toEqual([`verrou partagé ${AWA}`, `créer pour ${SHOP}`]);
    expect(audit).toEqual([
      {
        action: "product.submitted",
        actor: { type: "account", id: AWA },
        target: { type: "product", id: PRODUCT },
        details: { title: "Pagne wax 6 yards", reason: "creation" },
        context: CTX,
      },
    ]);
    await vendor.updateContent(AWA, PRODUCT, INPUT, CTX);
    expect(audit[1]?.details).toEqual({
      title: "Pagne wax 6 yards",
      reason: "modification",
      from: "published",
    });
  });

  it("sans boutique active (aucune, en attente, refusée, suspendue) : rien n'est écrit", async () => {
    for (const shop of [null, shopOf("pending"), shopOf("rejected"), shopOf("suspended")]) {
      const { vendor, calls, audit } = setup(shop);
      expect(await codeOf(vendor.create(AWA, INPUT, CTX))).toBe("BOUTIQUE_INACTIVE");
      expect(await codeOf(vendor.list(AWA, { limit: 10 }))).toBe("BOUTIQUE_INACTIVE");
      expect(calls.filter((c) => c.startsWith("créer"))).toEqual([]);
      expect(audit).toEqual([]);
    }
  });

  it("prix, stock, archivage : sans modération, mais tracés au journal (avant / après)", async () => {
    const { vendor, audit } = setup(shopOf("active"));
    await vendor.updateVariant(AWA, PRODUCT, VARIANT.id, { price: 4_500 }, CTX);
    await vendor.updateVariant(AWA, PRODUCT, VARIANT.id, { stock: 7, previousStock: 3 }, CTX);
    await vendor.archive(AWA, PRODUCT, CTX);
    expect(audit.map((e) => [e.action, e.details])).toEqual([
      ["product.variant_updated", { sku: "VAB12CD34-1", priceFrom: 5_000, priceTo: 4_500 }],
      ["product.variant_updated", { sku: "VAB12CD34-1", stockFrom: 3, stockTo: 7 }],
      ["product.archived", { title: "Pagne wax 6 yards", from: "published" }],
    ]);
  });
});

describe("VendorProductService — photos (S6-T04)", () => {
  it("ajout : boutique vérifiée, réencodage HORS transaction, puis rangement sous verrou et envoi en modération tracé", async () => {
    const { vendor, audit, calls } = setup(shopOf("active"));
    const after = await vendor.addImage(AWA, PRODUCT, new Uint8Array([1, 2, 3]), CTX);
    expect(after.status).toBe("PENDING");
    expect(calls).toEqual([
      `lecture ${AWA}`,
      "réencodage",
      `verrou partagé ${AWA}`,
      "ranger la photo",
    ]);
    expect(audit).toEqual([
      {
        action: "product.submitted",
        actor: { type: "account", id: AWA },
        target: { type: "product", id: PRODUCT },
        details: { title: "Pagne wax 6 yards", reason: "photo", from: "published" },
        context: CTX,
      },
    ]);
  });

  it("ajout sans boutique active : refus AVANT le réencodage (pas de calcul pour rien)", async () => {
    for (const shop of [null, shopOf("pending"), shopOf("suspended")]) {
      const { vendor, calls, audit } = setup(shop);
      expect(await codeOf(vendor.addImage(AWA, PRODUCT, new Uint8Array([1]), CTX))).toBe(
        "BOUTIQUE_INACTIVE",
      );
      expect(calls).not.toContain("réencodage");
      expect(audit).toEqual([]);
    }
  });

  it("retrait : tracé au journal avec l'identifiant de la photo (en minuscules)", async () => {
    const { vendor, audit } = setup(shopOf("active"));
    await vendor.removeImage(AWA, PRODUCT, IMAGE.toUpperCase(), CTX);
    expect(audit).toEqual([
      {
        action: "product.image_removed",
        actor: { type: "account", id: AWA },
        target: { type: "product", id: PRODUCT },
        details: { title: "Pagne wax 6 yards", image: IMAGE },
        context: CTX,
      },
    ]);
  });

  it("nouvel ordre et aperçu : sans journal, mais toujours réservés à une boutique active", async () => {
    const { vendor, audit } = setup(shopOf("active"));
    await vendor.reorderImages(AWA, PRODUCT, [IMAGE]);
    expect((await vendor.image(AWA, PRODUCT, IMAGE, "large")).id).toBe(IMAGE);
    expect(audit).toEqual([]);
    const { vendor: suspended } = setup(shopOf("suspended"));
    expect(await codeOf(suspended.image(AWA, PRODUCT, IMAGE, "large"))).toBe("BOUTIQUE_INACTIVE");
  });
});

describe("ProductModerationService (S6-T02)", () => {
  const moderator = { accountId: MODO, roles: ["client", "moderator"] as const };

  it("valide et trace la décision ; montre la boutique du produit", async () => {
    const { moderation, audit } = setup(shopOf("active"));
    const { product: decided, shop } = await moderation.decide(
      moderator,
      PRODUCT,
      "approve",
      null,
      NOW,
      CTX,
    );
    expect(decided.status).toBe("PUBLISHED");
    expect(shop).toEqual({ id: SHOP, name: "Chez Awa", status: "active" });
    expect(audit[0]).toMatchObject({
      action: "product.approved",
      actor: { type: "account", id: MODO },
      details: { title: "Pagne wax 6 yards", from: "pending", to: "published" },
    });
  });

  it("refus : motif au journal", async () => {
    const { moderation, audit } = setup(shopOf("active"));
    await moderation.decide(moderator, PRODUCT, "reject", "Photos trompeuses", NOW, CTX);
    expect(audit[0]).toMatchObject({
      action: "product.rejected",
      details: { reason: "Photos trompeuses", to: "rejected" },
    });
  });

  it("jamais pour un produit de sa propre boutique (UUID en majuscules compris)", async () => {
    const { moderation, audit } = setup(shopOf("active", MODO));
    const self = { accountId: MODO.toUpperCase(), roles: ["client", "moderator"] as const };
    expect(await codeOf(moderation.decide(self, PRODUCT, "approve", null, NOW, CTX))).toBe(
      "PRODUIT_SUR_SOI_INTERDIT",
    );
    expect(audit).toEqual([]);
  });

  it("défense en profondeur : sans rôle modérateur, refus avant toute lecture", async () => {
    const { moderation } = setup(shopOf("active"));
    const vendorOnly = { accountId: AWA, roles: ["client", "vendor"] as const };
    expect(await codeOf(moderation.decide(vendorOnly, PRODUCT, "approve", null, NOW, CTX))).toBe(
      "ACCES_REFUSE",
    );
    const admin = { accountId: AWA, roles: ["client", "admin"] as const };
    expect(await codeOf(moderation.decide(admin, PRODUCT, "approve", null, NOW, CTX))).toBe(
      "PRODUIT_SUR_SOI_INTERDIT",
    );
  });

  it("une erreur du catalogue remonte telle quelle (convertie en HTTP par la couche interface)", async () => {
    const { moderation } = setup(shopOf("active"));
    const failing = new ProductModerationService(
      { findById: () => Promise.resolve(null) } as unknown as ShopRepository,
      { run: (work) => work() },
      { record: () => Promise.resolve() },
      {
        moderationQueue: () => Promise.resolve({ items: [], next: null }),
        moderationGet: () => Promise.reject(new CatalogError("PRODUIT_INTROUVABLE", "x")),
        lockForModeration: () => Promise.reject(new CatalogError("PRODUIT_INTROUVABLE", "x")),
        moderate: () => Promise.reject(new Error("jamais appelé")),
        moderationImage: () => Promise.reject(new CatalogError("PHOTO_INTROUVABLE", "x")),
      },
    );
    expect(await codeOf(failing.get(PRODUCT))).toBe("PRODUIT_INTROUVABLE");
    expect(await codeOf(failing.image(PRODUCT, IMAGE, "large"))).toBe("PHOTO_INTROUVABLE");
    expect((await moderation.image(PRODUCT, IMAGE, "large")).id).toBe(IMAGE);
    expect(await codeOf(failing.decide(moderator, PRODUCT, "approve", null, NOW, CTX))).toBe(
      "PRODUIT_INTROUVABLE",
    );
    expect((await moderation.queue({ status: "PENDING", limit: 10 })).items[0]?.shop?.name).toBe(
      "Chez Awa",
    );
  });
});
