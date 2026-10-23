import "reflect-metadata";
import { demoCatalog, uuidV5, type DemoCatalog } from "@kemdia/contracts/demo";
import { randomBytes } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { configureApp } from "../src/http/configure-app.js";
import {
  importCatalog,
  prepareDemoCatalog,
} from "../src/modules/catalog/infrastructure/demo-catalog.js";
import { PrismaCategoryRepository } from "../src/modules/catalog/infrastructure/prisma-category.repository.js";
import { PrismaProductRepository } from "../src/modules/catalog/infrastructure/prisma-product.repository.js";
import {
  AvailabilityResponseSchema,
  CategoryTreeSchema,
  CategoryViewSchema,
  FacetsSchema,
  ProductDetailSchema,
  ProductPageSchema,
  SearchSuggestionsSchema,
} from "@kemdia/contracts";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Test de contrat sur la vraie base : l'API complète (catalogue de démonstration importé) renvoie,
 * pour TOUTES les catégories et TOUS les produits, des réponses conformes à la documentation OpenAPI.
 */
// Clé tirée au hasard à chaque exécution : aucune clé n'est écrite dans le code
const INTERNAL_KEY = randomBytes(32).toString("base64url");
const data: DemoCatalog = demoCatalog;

const matches = <T>(schema: z.ZodType<T>, body: unknown, what: string): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(`${what} :\n${z.prettifyError(result.error)}`);
  return result.data;
};

describe("API catalogue sur PostgreSQL (contrat)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;
  // Le test enchaîne des centaines de requêtes : il se présente comme le site (clé interne, non limité)
  const get = (url: string) =>
    request(app.getHttpServer()).get(url).set("X-Kemdia-Internal-Key", INTERNAL_KEY);

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: testDatabaseUrl(),
      API_INTERNAL_KEY: INTERNAL_KEY,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, config);
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe(
      'TRUNCATE "catalog"."product_variants", "catalog"."products", "catalog"."categories" CASCADE',
    );
    await importCatalog(prepareDemoCatalog(data), {
      categories: new PrismaCategoryRepository(prisma),
      products: new PrismaProductRepository(prisma),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it("arborescence complète (112 catégories, 3 niveaux)", async () => {
    const body = matches(
      CategoryTreeSchema,
      (await get("/api/v1/categories").expect(200)).body,
      "arborescence",
    );
    const count = (nodes: typeof body.items): number =>
      nodes.reduce((sum, n) => sum + 1 + count(n.children), 0);
    expect(count(body.items)).toBe(112);
  });

  it("chaque catégorie, une par une", async () => {
    for (const { slug } of data.categories) {
      const res = await get(`/api/v1/categories/${slug}`).expect(200);
      expect(matches(CategoryViewSchema, res.body, slug).category.slug).toBe(slug);
    }
  });

  it("chaque fiche produit, une par une (identifiants UUID, prix, stock)", async () => {
    for (const source of data.products) {
      const res = await get(`/api/v1/products/${source.slug}`).expect(200);
      const product = matches(ProductDetailSchema, res.body, source.slug);
      expect(product.id).toBe(uuidV5(`produit:${source.slug}`));
      expect(product.price).toBe(source.price);
      expect(product.totalStock).toBe(source.stock);
      expect(product.inStock).toBe(source.stock > 0);
    }
  });

  it("toutes les pages de la liste, dans chaque tri", async () => {
    for (const sort of ["pertinence", "nouveautes", "prix-asc", "prix-desc", "note"]) {
      const seen = new Set<string>();
      for (let page = 1; page <= 3; page++) {
        const res = await get(`/api/v1/products?sort=${sort}&page=${page}&pageSize=20`).expect(200);
        const body = matches(ProductPageSchema, res.body, `${sort} p.${page}`);
        body.items.forEach((p) => seen.add(p.id));
      }
      expect(seen.size, sort).toBe(50);
    }
  });

  it("compteurs des filtres et page Promotions", async () => {
    const all = matches(
      FacetsSchema,
      (await get("/api/v1/products/facets").expect(200)).body,
      "compteurs",
    );
    expect(all.prices.reduce((s, p) => s + p.count, 0)).toBe(50);
    const promo = matches(
      FacetsSchema,
      (await get("/api/v1/products/facets?scope=promotions").expect(200)).body,
      "compteurs promotions",
    );
    expect(promo.deals).toBe(data.products.filter((p) => p.oldPrice !== null).length);
    const list = await get("/api/v1/products?scope=promotions&pageSize=48").expect(200);
    expect(matches(ProductPageSchema, list.body, "promotions").total).toBe(promo.deals);
  });

  it("S7.5-T06 : recherche tolérante aux fautes de frappe (pg_trgm) et recherche exacte", async () => {
    const list = async (url: string) =>
      matches(ProductPageSchema, (await get(url).expect(200)).body, url);

    // Inversion de deux lettres : « sennhieser » → « sennheiser »
    const typo = await list("/api/v1/products?q=Sennhieser");
    expect(typo.correctedQuery).toBe("sennheiser");
    expect(typo.total).toBeGreaterThan(0);
    expect(typo.items.every((p) => p.brand === "Sennheiser")).toBe(true);
    // Lettre oubliée, mot gardé quand il est juste : « écuteurs beats » → « ecouteurs beats »
    expect((await list("/api/v1/products?q=%C3%A9cuteurs%20beats")).correctedQuery).toBe(
      "ecouteurs beats",
    );
    // Mots justes : aucune correction (le début d'un mot suffit)
    const exact = await list("/api/v1/products?q=aspirateur");
    expect(exact.correctedQuery).toBeUndefined();
    expect(exact.total).toBeGreaterThan(0);
    // Trop éloigné : aucun résultat plutôt qu'un résultat hors sujet
    const none = await list("/api/v1/products?q=xqzwvk");
    expect(none.total).toBe(0);
    expect(none.correctedQuery).toBeUndefined();
    // Deux mots justes qu'aucune fiche ne réunit : aucun n'est « corrigé » vers un autre mot
    const both = await list("/api/v1/products?q=beats%20sennheiser");
    expect(both.total).toBe(0);
    expect(both.correctedQuery).toBeUndefined();
    // exact=1 : pas de correction
    const asTyped = await list("/api/v1/products?q=sennhieser&exact=1");
    expect(asTyped.total).toBe(0);
    expect(asTyped.correctedQuery).toBeUndefined();
    // Les compteurs suivent la même correction que la liste
    const facets = matches(
      FacetsSchema,
      (await get("/api/v1/products/facets?q=sennhieser").expect(200)).body,
      "compteurs corrigés",
    );
    expect(facets.prices.reduce((s, p) => s + p.count, 0)).toBe(typo.total);
  });

  it("S7.5-T06 : suggestions pendant la frappe (produits, rayons, marques)", async () => {
    const suggest = async (q: string) =>
      matches(
        SearchSuggestionsSchema,
        (await get(`/api/v1/products/suggestions?q=${encodeURIComponent(q)}`).expect(200)).body,
        `suggestions ${q}`,
      );
    // Mot en cours de frappe
    const senn = await suggest("senn");
    expect(senn.products.length).toBeGreaterThan(0);
    expect(senn.brands).toEqual(["Sennheiser"]);
    // Rayons dont le nom contient le mot
    const parfums = await suggest("parfum");
    expect(parfums.categories.length).toBeGreaterThan(0);
    expect(parfums.categories.every((c) => c.name.toLowerCase().includes("parfum"))).toBe(true);
    // Avec une faute
    expect((await suggest("sennhieser")).correctedQuery).toBe("sennheiser");
    // Moins de 2 lettres : rien
    expect(await suggest("s")).toEqual({ products: [], categories: [], brands: [] });
    // Jamais plus de 8 suggestions
    const many = await suggest("e");
    expect(many.products.length + many.categories.length + many.brands.length).toBe(0);
    const broad = await suggest("pro");
    expect(broad.products.length + broad.categories.length + broad.brands.length).toBeLessThan(9);
  });

  it("disponibilité (BR-001) sur les stocks réels", async () => {
    const empty = data.products.find((p) => p.stock === 0);
    const full = data.products.find((p) => p.stock > 0);
    const res = await request(app.getHttpServer())
      .post("/api/v1/availability")
      .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
      .send({
        lines: [
          { variantId: uuidV5(`variante:${full?.slug}`), quantity: 1 },
          { variantId: uuidV5(`variante:${empty?.slug}`), quantity: 1 },
        ],
      })
      .expect(200);
    expect(
      matches(AvailabilityResponseSchema, res.body, "disponibilité").lines.map((l) => l.ok),
    ).toEqual([true, false]);
  });
});
