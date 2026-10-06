import "reflect-metadata";
import { randomBytes } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { DatabaseHealth, type DatabaseStatus } from "../src/database/database-health.js";
import { DOCS_CSP } from "../src/docs/docs.controller.js";
import { configureApp } from "../src/http/configure-app.js";
import { ProblemDetailsSchema } from "../src/http/problem-details.schema.js";
import {
  CATEGORY_REPOSITORY,
  PRODUCT_REPOSITORY,
} from "../src/modules/catalog/application/ports.js";
import { createCategory } from "../src/modules/catalog/domain/category.js";
import { Product } from "../src/modules/catalog/domain/product.js";
import {
  AvailabilityResponseSchema,
  CategoryTreeSchema,
  CategoryViewSchema,
  FacetsSchema,
  ProductDetailSchema,
  ProductPageSchema,
} from "../src/modules/catalog/interface/schemas.js";
import { ids, productProps, variantProps } from "./catalog/fixtures.js";
import { InMemoryCategories, InMemoryProducts } from "./catalog/in-memory.js";

/**
 * Routes HTTP du catalogue, sans base de données (dépôts en mémoire).
 * Chaque réponse est confrontée au schéma publié dans la documentation OpenAPI (test de contrat).
 * Le SQL réel est testé dans test/catalog.int.test.ts.
 */
// Clé tirée au hasard à chaque exécution : aucune clé n'est écrite dans le code
const INTERNAL_KEY = randomBytes(32).toString("base64url");

const root = createCategory({
  id: ids.category,
  slug: "high-tech",
  name: "High-Tech",
  parentId: null,
  icon: "laptop",
  image: null,
  position: 0,
});
const phones = createCategory({
  id: "4f5a6b7c-8d9e-4f0a-8b2c-3d4e5f6a7b8c",
  slug: "telephones",
  name: "Téléphones",
  parentId: root.id,
  icon: "mobile",
  image: null,
  position: 0,
});

const published = Product.create(
  productProps({
    categoryId: phones.id,
    variants: [
      variantProps(),
      variantProps({ id: ids.v2, sku: "KMD-TEL-OFF", name: "Rouge", isActive: false }),
    ],
  }),
);
const draft = Product.create(
  productProps({
    id: "5a6b7c8d-9e0f-4a1b-8c3d-4e5f6a7b8c9d",
    slug: "brouillon",
    status: "DRAFT",
    variants: [variantProps({ id: "6b7c8d9e-0f1a-4b2c-8d4e-5f6a7b8c9d0e", sku: "KMD-DRAFT" })],
  }),
);

class FakeDatabaseHealth {
  check(): Promise<DatabaseStatus> {
    return Promise.resolve("ok");
  }
}

async function startApp(env: NodeJS.ProcessEnv = {}): Promise<NestExpressApplication> {
  const config = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    APP_VERSION: "sha-test",
    RATE_LIMIT_PER_MINUTE: "10",
    API_INTERNAL_KEY: INTERNAL_KEY,
    ...env,
  });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
    .overrideProvider(DatabaseHealth)
    .useValue(new FakeDatabaseHealth())
    .overrideProvider(CATEGORY_REPOSITORY)
    .useValue(new InMemoryCategories([root, phones]))
    .overrideProvider(PRODUCT_REPOSITORY)
    .useValue(new InMemoryProducts([published, draft]))
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, config);
  await app.init();
  return app;
}

/** Vérifie la forme d'une réponse et renvoie son contenu typé. */
const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};

describe("API catalogue — routes HTTP", () => {
  let app: NestExpressApplication;
  // Une adresse différente par test : la limitation de débit (10/min ici) ne gêne pas les autres tests
  let ip = 0;
  const api = () => {
    const from = `10.0.0.${++ip}`;
    const agent = request(app.getHttpServer());
    return {
      get: (url: string) => agent.get(url).set("X-Forwarded-For", from),
      post: (url: string) => agent.post(url).set("X-Forwarded-For", from),
    };
  };

  beforeAll(async () => {
    app = await startApp({ TRUST_PROXY: "1" });
  });
  afterAll(async () => {
    await app.close();
  });

  it("GET /api/v1/categories : arborescence, mise en cache 60 s", async () => {
    const res = await api().get("/api/v1/categories").expect(200);
    const body = matches(CategoryTreeSchema, res.body);
    expect(body.items[0]?.children.map((c) => c.slug)).toEqual(["telephones"]);
    expect(res.headers["cache-control"]).toContain("max-age=60");
    expect(res.headers.etag).toBeTruthy();
  });

  it("GET /api/v1/categories/:slug : fil d'Ariane ; 404 si inconnue ou adresse invalide", async () => {
    const res = await api().get("/api/v1/categories/telephones").expect(200);
    expect(matches(CategoryViewSchema, res.body).path.map((c) => c.slug)).toEqual([
      "high-tech",
      "telephones",
    ]);
    for (const slug of ["inconnue", "MAJUSCULES", "a%20b"]) {
      const notFound = await api().get(`/api/v1/categories/${slug}`).expect(404);
      matches(ProblemDetailsSchema, notFound.body);
    }
  });

  it("GET /api/v1/products : page au format documenté, paramètres farfelus ignorés", async () => {
    const res = await api()
      .get("/api/v1/products?category=high-tech&sort=DROP&page=-1&pageSize=9999&q[]=x&q[]=y")
      .expect(200);
    expect(matches(ProductPageSchema, res.body)).toMatchObject({ page: 1, pageSize: 48 });
  });

  it("GET /api/v1/products/facets : n'est pas confondu avec une fiche produit", async () => {
    const res = await api().get("/api/v1/products/facets?scope=promotions").expect(200);
    expect(matches(FacetsSchema, res.body).prices).toHaveLength(4);
  });

  it("GET /api/v1/products/:slug : fiche avec variantes actives seulement ; brouillon introuvable", async () => {
    const res = await api().get("/api/v1/products/telephone-kemdia").expect(200);
    const body = matches(ProductDetailSchema, res.body);
    expect(body.path.map((c) => c.slug)).toEqual(["high-tech", "telephones"]);
    expect(body.variants.map((v) => v.sku)).toEqual(["KMD-TEL-NOIR"]);
    expect(body.variants[0]?.available).toBe(true);
    await api().get("/api/v1/products/brouillon").expect(404);
  });

  describe("POST /api/v1/availability (BR-001)", () => {
    it("réponse ligne par ligne, jamais mise en cache", async () => {
      const res = await api()
        .post("/api/v1/availability")
        .send({
          lines: [
            { variantId: ids.v1, quantity: 2 },
            { variantId: ids.v1, quantity: 9 },
            { variantId: ids.v2, quantity: 1 },
          ],
        })
        .expect(200);
      expect(matches(AvailabilityResponseSchema, res.body)).toEqual({
        ok: false,
        lines: [
          { variantId: ids.v1, quantity: 2, ok: true },
          { variantId: ids.v1, quantity: 9, ok: false, reason: "STOCK_INSUFFISANT", available: 5 },
          { variantId: ids.v2, quantity: 1, ok: false, reason: "PRODUIT_INDISPONIBLE" },
        ],
      });
      expect(res.headers["cache-control"]).toBe("no-store");
    });

    it("corps invalide : 400 avec une explication en français", async () => {
      const cases = [
        {},
        { lines: [] },
        { lines: [{ variantId: "42", quantity: 1 }] },
        { lines: [{ variantId: ids.v1, quantity: 0 }] },
        { lines: [{ variantId: ids.v1, quantity: 1, price: 1 }] }, // champ inattendu : refusé
        { lines: Array.from({ length: 101 }, () => ({ variantId: ids.v1, quantity: 1 })) },
      ];
      for (const body of cases) {
        const res = await api().post("/api/v1/availability").send(body).expect(400);
        const problem = matches(ProblemDetailsSchema, res.body);
        expect(problem.title).toBe("Requête invalide");
        expect(problem.detail, JSON.stringify(body).slice(0, 60)).toMatch(/lines/);
      }
    });
  });

  describe("limitation de débit", () => {
    it("au-delà de la limite : 429 en français, avec Retry-After", async () => {
      const client = api();
      for (let i = 0; i < 10; i++) await client.get("/api/v1/categories").expect(200);
      const res = await client.get("/api/v1/categories").expect(429);
      expect(matches(ProblemDetailsSchema, res.body)).toMatchObject({
        title: "Trop de requêtes",
        detail: "Trop de requêtes : réessayez dans quelques instants.",
      });
      expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
    });

    it("la limite est comptée par adresse : un autre visiteur n'est pas bloqué", async () => {
      await api().get("/api/v1/categories").expect(200);
    });

    it("le site, avec la clé interne, n'est pas limité ; une fausse clé ne sert à rien", async () => {
      const client = api();
      for (let i = 0; i < 12; i++) {
        await client
          .get("/api/v1/categories")
          .set("X-Kemdia-Internal-Key", INTERNAL_KEY)
          .expect(200);
      }
      const other = api();
      for (let i = 0; i < 10; i++)
        await other.get("/api/v1/categories").set("X-Kemdia-Internal-Key", "faux");
      await other.get("/api/v1/categories").set("X-Kemdia-Internal-Key", "faux").expect(429);
    });

    it("vérification de disponibilité : sa propre limite, 30 par minute", async () => {
      const client = api();
      const body = { lines: [{ variantId: ids.v1, quantity: 1 }] };
      for (let i = 0; i < 30; i++) await client.post("/api/v1/availability").send(body).expect(200);
      await client.post("/api/v1/availability").send(body).expect(429);
    });

    it("le contrôle de santé n'est jamais limité", async () => {
      const client = api();
      for (let i = 0; i < 15; i++) await client.get("/api/health").expect(200);
    });
  });

  describe("documentation", () => {
    it("GET /api/v1/openapi.json : description OpenAPI 3.1", async () => {
      const res = await api().get("/api/v1/openapi.json").expect(200);
      expect((res.body as { openapi: string }).openapi).toBe("3.1.0");
    });

    it("GET /api/docs : page servie par l'API elle-même, CSP stricte, aucun script tiers", async () => {
      const res = await api().get("/api/docs").expect(200).expect("Content-Type", /html/);
      expect(res.headers["content-security-policy"]).toBe(DOCS_CSP);
      expect(res.text).not.toMatch(/https?:\/\//);
      expect(res.text).not.toMatch(/<script>/);
      const js = await api().get("/api/docs/assets/swagger-ui-bundle.js").expect(200);
      expect(js.headers["content-type"]).toContain("javascript");
    });

    it("seuls les fichiers prévus sont servis", async () => {
      for (const file of [
        "package.json",
        "swagger-ui-bundle.js.map",
        "..%2F..%2Fpackage.json",
        "index.html",
      ]) {
        await api().get(`/api/docs/assets/${file}`).expect(404);
      }
    });
  });
});

describe("API catalogue — documentation désactivée", () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await startApp({ API_DOCS: "false" });
  });
  afterAll(async () => {
    await app.close();
  });

  it("ni page ni description quand API_DOCS=false (défaut en production)", async () => {
    await request(app.getHttpServer()).get("/api/docs").expect(404);
    await request(app.getHttpServer()).get("/api/v1/openapi.json").expect(404);
    await request(app.getHttpServer()).get("/api/v1/categories").expect(200);
  });
});
