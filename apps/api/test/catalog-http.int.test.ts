import "reflect-metadata";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
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
  uuidV5,
  type DemoCatalog,
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
} from "../src/modules/catalog/interface/schemas.js";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Test de contrat sur la vraie base : l'API complète (catalogue de démonstration importé) renvoie,
 * pour TOUTES les catégories et TOUS les produits, des réponses conformes à la documentation OpenAPI.
 */
// Clé tirée au hasard à chaque exécution : aucune clé n'est écrite dans le code
const INTERNAL_KEY = randomBytes(32).toString("base64url");
const data = JSON.parse(
  readFileSync(new URL("../prisma/seed/catalogue-demo.json", import.meta.url), "utf8"),
) as DemoCatalog;

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
