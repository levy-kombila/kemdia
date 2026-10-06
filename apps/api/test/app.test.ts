import "reflect-metadata";
import { Body, Controller, Get, HttpException, Post } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { configureApp } from "../src/http/configure-app.js";

/** Routes de test uniquement : erreurs prévues et imprévues, lecture d'un corps JSON. */
@Controller("essai")
class ProbeController {
  @Get("panne")
  crash(): never {
    throw new Error("connexion refusée à postgres://admin:secret@db:5432");
  }

  @Get("refus")
  refuse(): never {
    throw new HttpException("Stock insuffisant pour ce produit", 409);
  }

  @Post("echo")
  echo(@Body() body: unknown): unknown {
    return body;
  }
}

async function startApp(env: NodeJS.ProcessEnv = {}): Promise<NestExpressApplication> {
  const config = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    APP_VERSION: "sha-test",
    ...env,
  });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(config)],
    controllers: [ProbeController],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, config);
  await app.init();
  return app;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe("API — socle HTTP", () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await startApp();
  });
  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/health", () => {
    it("indique la version et l'environnement, sans cache", async () => {
      const res = await request(app.getHttpServer()).get("/api/health").expect(200);
      expect(res.body).toEqual({ status: "ok", version: "sha-test", environment: "local" });
      expect(res.headers["cache-control"]).toBe("no-store");
    });

    it("n'existe pas sous /api/v1 (route sans version)", async () => {
      await request(app.getHttpServer()).get("/api/v1/health").expect(404);
    });
  });

  it("les routes métier sont versionnées sous /api/v1", async () => {
    await request(app.getHttpServer()).get("/api/v1/essai/refus").expect(409);
    await request(app.getHttpServer()).get("/api/essai/refus").expect(404);
  });

  describe("en-têtes de sécurité", () => {
    it("sont présents et ne révèlent pas la technologie", async () => {
      const res = await request(app.getHttpServer()).get("/api/health");
      expect(res.headers["x-powered-by"]).toBeUndefined();
      expect(res.headers["content-security-policy"]).toBe(
        "default-src 'none';frame-ancestors 'none'",
      );
      expect(res.headers["x-frame-options"]).toBe("DENY");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["strict-transport-security"]).toContain("max-age=63072000");
      expect(res.headers["cross-origin-resource-policy"]).toBe("same-site");
    });

    it("chaque réponse porte un identifiant de requête", async () => {
      const res = await request(app.getHttpServer()).get("/api/health");
      expect(res.headers["x-request-id"]).toMatch(UUID);
      const id = "0b9f1c7e-3f5a-4b8e-9c2d-1a2b3c4d5e6f";
      const relayed = await request(app.getHttpServer()).get("/api/health").set("X-Request-Id", id);
      expect(relayed.headers["x-request-id"]).toBe(id);
    });
  });

  describe("erreurs au format Problem Details (RFC 9457)", () => {
    it("route inconnue : 404 sans recopier l'adresse demandée", async () => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/<script>alert(1)</script>")
        .expect(404)
        .expect("Content-Type", /application\/problem\+json/);
      expect(res.body).toEqual({
        type: "about:blank",
        title: "Ressource introuvable",
        status: 404,
        requestId: expect.stringMatching(UUID),
      });
      expect(res.text).not.toContain("script");
    });

    it("erreur prévue : le message destiné au client est conservé", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/essai/refus").expect(409);
      expect(res.body).toMatchObject({
        title: "Conflit",
        detail: "Stock insuffisant pour ce produit",
      });
    });

    it("erreur imprévue : 500 générique, aucun détail technique ni secret", async () => {
      const res = await request(app.getHttpServer()).get("/api/v1/essai/panne").expect(500);
      expect(res.body).toEqual({
        type: "about:blank",
        title: "Erreur interne",
        status: 500,
        requestId: expect.stringMatching(UUID),
      });
      expect(res.text).not.toMatch(/postgres|secret|stack|Error/);
    });

    it("JSON mal formé : 400", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/essai/echo")
        .set("Content-Type", "application/json")
        .send('{"nom": ')
        .expect(400);
      expect(res.body).toMatchObject({ title: "Requête invalide", status: 400 });
    });

    it("corps trop volumineux (> 100 Ko) : 413", async () => {
      const res = await request(app.getHttpServer())
        .post("/api/v1/essai/echo")
        .send({ texte: "x".repeat(120_000) })
        .expect(413);
      expect(res.body).toMatchObject({ title: "Requête trop volumineuse", status: 413 });
    });

    it("un corps raisonnable est accepté", async () => {
      await request(app.getHttpServer())
        .post("/api/v1/essai/echo")
        .send({ nom: "Kemdia" })
        .expect(201, { nom: "Kemdia" });
    });
  });

  it("CORS fermé par défaut : aucun site tiers ne peut appeler l'API depuis un navigateur", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/health")
      .set("Origin", "https://site-malveillant.example");
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("API — CORS configuré", () => {
  let app: NestExpressApplication;
  beforeAll(async () => {
    app = await startApp({ CORS_ORIGINS: "https://kemdia.ga" });
  });
  afterAll(async () => {
    await app.close();
  });

  it("autorise uniquement les origines listées", async () => {
    const ok = await request(app.getHttpServer())
      .get("/api/health")
      .set("Origin", "https://kemdia.ga");
    expect(ok.headers["access-control-allow-origin"]).toBe("https://kemdia.ga");
    const ko = await request(app.getHttpServer())
      .get("/api/health")
      .set("Origin", "https://site-malveillant.example");
    expect(ko.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
