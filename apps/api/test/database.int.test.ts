import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { loadConfig, type AppConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { configureApp } from "../src/http/configure-app.js";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Tests d'intégration : une VRAIE base PostgreSQL, migrations appliquées (`pnpm db:deploy`).
 * Lancés par `pnpm test:int` avec DATABASE_URL (en CI : base éphémère détruite après le job).
 */
const DATABASE_URL = testDatabaseUrl();

const configFor = (env: NodeJS.ProcessEnv = {}): AppConfig =>
  loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    APP_VERSION: "sha-int",
    DATABASE_URL,
    ...env,
  });

async function startApp(config: AppConfig): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, config);
  await app.init();
  return app;
}

describe("PostgreSQL (intégration)", () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await startApp(configFor({ DATABASE_STATEMENT_TIMEOUT_MS: "500" }));
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
  });

  it("/api/health : 200 et base « ok »", async () => {
    const res = await request(app.getHttpServer()).get("/api/health").expect(200);
    expect(res.body).toMatchObject({ status: "ok", checks: { database: "ok" } });
  });

  it("les migrations ont créé le schéma de chaque module", async () => {
    const rows = await prisma.$queryRaw<{ schema_name: string }[]>`
      SELECT schema_name FROM information_schema.schemata WHERE schema_name IN ('catalog')`;
    expect(rows.map((r) => r.schema_name)).toEqual(["catalog"]);
  });

  it("chaque connexion est identifiée dans PostgreSQL", async () => {
    const [row] = await prisma.$queryRaw<{ name: string }[]>`
      SELECT current_setting('application_name') AS name`;
    expect(row?.name).toBe("kemdia-api-local");
  });

  it("une requête trop longue est interrompue (statement_timeout)", async () => {
    await expect(prisma.$queryRaw`SELECT pg_sleep(2)`).rejects.toThrow(/timeout|annul|cancel/i);
    // La connexion reste utilisable ensuite
    await expect(prisma.$queryRaw`SELECT 1`).resolves.toBeTruthy();
  });

  it("valeurs SQL toujours passées en paramètres (pas d'injection)", async () => {
    const hostile = "'; DROP SCHEMA catalog CASCADE; --";
    const [row] = await prisma.$queryRaw<{ v: string }[]>`SELECT ${hostile}::text AS v`;
    expect(row?.v).toBe(hostile);
    const rows = await prisma.$queryRaw<unknown[]>`
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'catalog'`;
    expect(rows).toHaveLength(1);
  });
});

describe("PostgreSQL injoignable (intégration)", () => {
  it("/api/health répond 503 sans exposer l'adresse ni le mot de passe", async () => {
    const unreachable = new URL(DATABASE_URL);
    unreachable.port = "1"; // aucun serveur n'écoute sur ce port
    unreachable.password = "motdepasse-a-ne-pas-montrer";
    const app = await startApp(configFor({ DATABASE_URL: unreachable.toString() }));
    try {
      const res = await request(app.getHttpServer()).get("/api/health").expect(503);
      expect(res.body).toMatchObject({ status: "degrade", checks: { database: "indisponible" } });
      expect(res.text).not.toMatch(/motdepasse|postgres|:1\b/);
    } finally {
      await app.close();
    }
  });
});
