import "reflect-metadata";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { CatalogService } from "../src/modules/catalog/application/catalog.service.js";
import { Product } from "../src/modules/catalog/domain/product.js";
import {
  importCatalog,
  prepareDemoCatalog,
  uuidV5,
  type DemoCatalog,
} from "../src/modules/catalog/infrastructure/demo-catalog.js";
import { PrismaCategoryRepository } from "../src/modules/catalog/infrastructure/prisma-category.repository.js";
import { PrismaProductRepository } from "../src/modules/catalog/infrastructure/prisma-product.repository.js";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Module catalog sur une VRAIE base : SQL de recherche, filtres, tri, pagination, compteurs, BR-001,
 * contraintes de la base. Les résultats attendus sont recalculés à partir du fichier de démonstration,
 * avec la même logique que le site : l'API donnera les mêmes listes que le site d'aujourd'hui (S3-T05).
 */
const data = JSON.parse(
  readFileSync(new URL("../prisma/seed/catalogue-demo.json", import.meta.url), "utf8"),
) as DemoCatalog;

const config = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: testDatabaseUrl(),
});
const prisma = new PrismaService(config);
const categories = new PrismaCategoryRepository(prisma);
const products = new PrismaProductRepository(prisma);
const service = new CatalogService(categories, products);

// --- Logique de référence (celle du site, apps/web/src/lib/catalog.ts) ---
const legacyCategory = new Map(data.categories.map((c) => [c.id, c]));
const legacyDescendants = (slug: string) => {
  const root = data.categories.find((c) => c.slug === slug);
  const ids = new Set(root ? [root.id] : []);
  for (let added = true; added;) {
    added = false;
    for (const c of data.categories) {
      if (c.parentId && ids.has(c.parentId) && !ids.has(c.id)) {
        ids.add(c.id);
        added = true;
      }
    }
  }
  return ids;
};
const normalize = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const legacySearch = (q: string) => {
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  return data.products.filter((p) => {
    const haystack = normalize(
      `${p.title} ${p.brand ?? ""} ${legacyCategory.get(p.categoryId)?.name ?? ""} ${p.color ?? ""}`,
    );
    return terms.every((t) => haystack.includes(t));
  });
};
const slugs = (items: { slug: string }[]) => items.map((p) => p.slug).sort();

beforeAll(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "catalog"."product_variants", "catalog"."products", "catalog"."categories" CASCADE',
  );
  await importCatalog(prepareDemoCatalog(data), { categories, products });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Catalogue (intégration PostgreSQL)", () => {
  it("import : 112 catégories, 50 produits, 50 variantes, identifiants UUID (BR-042)", async () => {
    expect(await prisma.category.count()).toBe(112);
    expect(await prisma.product.count()).toBe(50);
    expect(await prisma.productVariant.count()).toBe(50);
    const ids = await prisma.product.findMany({ select: { id: true } });
    expect(ids.every(({ id }) => /^[0-9a-f-]{36}$/.test(id))).toBe(true);
  });

  it("import relancé : aucune ligne en double", async () => {
    await importCatalog(prepareDemoCatalog(data), { categories, products });
    expect(await prisma.product.count()).toBe(50);
    expect(await prisma.category.count()).toBe(112);
  });

  it("arborescence relue depuis la base", async () => {
    const roots = await service.getCategoryRoots();
    expect(roots.map((r) => r.slug).sort()).toEqual(
      data.categories
        .filter((c) => c.parentId === null)
        .map((c) => c.slug)
        .sort(),
    );
    const view = await service.getCategory("fitness-yoga");
    expect(view?.path.map((c) => c.slug)).toEqual([
      "mode",
      "mode-sport",
      "sport-fitness",
      "fitness-yoga",
    ]);
  });

  it("une catégorie inclut les produits de ses sous-catégories (comme le site)", async () => {
    for (const slug of ["high-tech", "mode", "mode-sport", "sport-fitness", "fitness-yoga"]) {
      const expected = data.products.filter((p) => legacyDescendants(slug).has(p.categoryId));
      expect(
        expected.length,
        `${slug} : la donnée de référence doit contenir des produits`,
      ).toBeGreaterThan(0);
      const page = await service.searchProducts({ categorySlug: slug, pageSize: 48 });
      expect(page.total, slug).toBe(expected.length);
      expect(slugs(page.items), slug).toEqual(slugs(expected).slice(0, 48));
    }
  });

  it("recherche sans accents ni majuscules, mot par mot (comme le site)", async () => {
    for (const q of [
      "apple",
      "ECOUTEURS",
      "randonnée",
      "elite rose",
      "fitness violet",
      "zzz-introuvable",
    ]) {
      const page = await service.searchProducts({ q, pageSize: 48 });
      expect(slugs(page.items), q).toEqual(slugs(legacySearch(q)));
    }
    // Les recherches ci-dessus ne passent pas toutes « à vide »
    for (const q of ["apple", "ECOUTEURS", "randonnée", "elite rose", "fitness violet"]) {
      expect(legacySearch(q).length, q).toBeGreaterThan(0);
    }
  });

  it("une recherche hostile ne casse rien et ne trouve rien d'anormal", async () => {
    const page = await service.searchProducts({ q: "%' OR 1=1 --" });
    expect(page.total).toBe(legacySearch("or 1 1").length);
    expect(await prisma.product.count()).toBe(50);
  });

  it("filtres : stock, promotion, note, marques, prix", async () => {
    const count = async (input: object) => (await service.searchProducts(input)).total;
    expect(await count({ inStock: "1" })).toBe(data.products.filter((p) => p.stock > 0).length);
    expect(await count({ onlyDeals: "1" })).toBe(
      data.products.filter((p) => p.oldPrice !== null).length,
    );
    expect(await count({ minRating: "4" })).toBe(data.products.filter((p) => p.rating >= 4).length);
    expect(await count({ brands: "Apple,Samsung" })).toBe(
      data.products.filter((p) => p.brand === "Apple" || p.brand === "Samsung").length,
    );
    expect(await count({ priceMin: "50000", priceMax: "150000" })).toBe(
      data.products.filter((p) => p.price >= 50_000 && p.price <= 150_000).length,
    );
  });

  it("tri par prix et pagination stable (aucun produit répété ni oublié)", async () => {
    const seen: string[] = [];
    let previousPrice = 0;
    for (let page = 1; page <= 3; page++) {
      const result = await service.searchProducts({ sort: "prix-asc", page, pageSize: 20 });
      expect(result.totalPages).toBe(3);
      for (const item of result.items) {
        expect(item.price).toBeGreaterThanOrEqual(previousPrice);
        previousPrice = item.price;
        seen.push(item.slug);
      }
    }
    expect(new Set(seen).size).toBe(50);
  });

  it("page trop loin : dernière page", async () => {
    const result = await service.searchProducts({ page: "40", pageSize: 20 });
    expect(result.page).toBe(3);
    expect(result.items).toHaveLength(10);
  });

  it("compteurs des filtres identiques à ceux du site", async () => {
    const ranges = [
      { key: "moins-50000", min: 0, max: 49_999 },
      { key: "50000-150000", min: 50_000, max: 150_000 },
    ];
    const facets = await service.getFacets({ categorySlug: "high-tech" }, ranges);
    const base = data.products.filter((p) => legacyDescendants("high-tech").has(p.categoryId));
    expect(facets.inStock).toBe(base.filter((p) => p.stock > 0).length);
    expect(facets.deals).toBe(base.filter((p) => p.oldPrice !== null).length);
    expect(facets.rating4).toBe(base.filter((p) => p.rating >= 4).length);
    expect(facets.prices).toEqual(
      ranges.map((r) => ({
        key: r.key,
        count: base.filter((p) => p.price >= r.min && p.price <= r.max).length,
      })),
    );
    const brandTotal = facets.brands.reduce((sum, b) => sum + b.count, 0);
    expect(brandTotal).toBe(base.filter((p) => p.brand).length);
  });

  it("fiche produit avec sa variante, son prix et son stock", async () => {
    const source = data.products[0];
    const product = await service.getProduct(source?.slug ?? "");
    expect(product?.id).toBe(uuidV5(`produit:${source?.slug}`));
    expect(product?.price).toBe(source?.price);
    expect(product?.totalStock).toBe(source?.stock);
  });

  it("BR-001 : disponibilité vérifiée sur les stocks réels", async () => {
    const empty = data.products.find((p) => p.stock === 0);
    const full = data.products.find((p) => p.stock > 2);
    const variant = (slug?: string) => uuidV5(`variante:${slug}`);
    const result = await service.checkAvailability([
      { variantId: variant(full?.slug), quantity: 2 },
      { variantId: variant(empty?.slug), quantity: 1 },
      { variantId: variant(full?.slug), quantity: (full?.stock ?? 0) + 1 },
    ]);
    expect(result.map((r) => (r.ok ? "ok" : r.reason))).toEqual([
      "ok",
      "PRODUIT_INDISPONIBLE",
      "STOCK_INSUFFISANT",
    ]);
  });

  it("produit archivé : invisible, ni listé ni commandable", async () => {
    const source = data.products[1];
    const product = await service.getProduct(source?.slug ?? "");
    if (!product) throw new Error("produit de démonstration introuvable");
    const archived = Product.create({ ...product, status: "ARCHIVED", variants: product.variants });
    await products.save(archived, archived.searchText(""));
    expect(await service.getProduct(product.slug)).toBeNull();
    expect(
      (await service.searchProducts({ q: product.title, pageSize: 48 })).items.map((p) => p.slug),
    ).not.toContain(product.slug);
    const [line] = await service.checkAvailability([
      { variantId: product.variants[0]?.id ?? "", quantity: 1 },
    ]);
    expect(line).toMatchObject({ ok: false, reason: "PRODUIT_INDISPONIBLE" });
  });

  it("variante retirée d'un produit : désactivée, jamais supprimée (BR-002)", async () => {
    const source = data.products[2];
    const product = await service.getProduct(source?.slug ?? "");
    if (!product) throw new Error("produit de démonstration introuvable");
    const newVariantId = "7c8d9e0f-1a2b-4c3d-8e4f-5a6b7c8d9e0f";
    const replaced = Product.create({
      ...product,
      variants: [
        {
          ...(product.variants[0] as object),
          id: newVariantId,
          sku: "KMD-NOUVELLE",
          stock: 1,
        } as never,
      ],
    });
    await products.save(replaced, replaced.searchText(""));
    const rows = await prisma.productVariant.findMany({ where: { productId: product.id } });
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.id === product.variants[0]?.id)?.isActive).toBe(false);
  });

  describe("la base refuse les incohérences même sans passer par le code", () => {
    const variantOf = async () =>
      (await prisma.productVariant.findFirstOrThrow({ where: { isActive: true } })).id;

    it("stock négatif", async () => {
      const id = await variantOf();
      await expect(
        prisma.$executeRaw`UPDATE "catalog"."product_variants" SET "stock" = -1 WHERE "id" = ${id}::uuid`,
      ).rejects.toThrow(/product_variants_stock_check/);
    });

    it("prix nul ou prix barré inférieur au prix", async () => {
      const id = await variantOf();
      await expect(
        prisma.$executeRaw`UPDATE "catalog"."product_variants" SET "price" = 0 WHERE "id" = ${id}::uuid`,
      ).rejects.toThrow(/product_variants_price_check/);
      await expect(
        prisma.$executeRaw`UPDATE "catalog"."product_variants" SET "compare_at_price" = 1 WHERE "id" = ${id}::uuid`,
      ).rejects.toThrow(/compare_at_price_check/);
    });

    it("suppression d'une catégorie qui contient des produits", async () => {
      const { categoryId } = await prisma.product.findFirstOrThrow();
      await expect(prisma.category.delete({ where: { id: categoryId } })).rejects.toThrow();
    });
  });
});
