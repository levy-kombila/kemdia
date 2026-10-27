import "reflect-metadata";
import { randomBytes } from "node:crypto";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import {
  FallbackRateCounters,
  MemoryRateCounters,
  PostgresRateCounters,
  RATE_COUNTERS,
  type RateCounters,
} from "../src/database/rate-counters.js";
import { configureApp } from "../src/http/configure-app.js";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Compteurs partagés sur une VRAIE base (S8-T07, ADR-0064) : mêmes règles que la version en mémoire, aucun appel
 * perdu quand plusieurs requêtes comptent en même temps, et DEUX instances de l'API appliquent ensemble la même
 * limite de débit.
 */
const at = (seconds: number) => new Date(Date.UTC(2026, 9, 27, 12, 0, 0) + seconds * 1000);

async function startApi(limit: number): Promise<NestExpressApplication> {
  const config = loadConfig({
    NODE_ENV: "test",
    LOG_LEVEL: "silent",
    DATABASE_URL: testDatabaseUrl(),
    API_INTERNAL_KEY: randomBytes(32).toString("base64url"),
    RATE_LIMIT_PER_MINUTE: String(limit),
    RATE_LIMIT_STORE: "database",
  });
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(config)],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
  configureApp(app, config);
  await app.init();
  return app;
}

describe("Compteurs partagés (PostgreSQL)", () => {
  let first: NestExpressApplication;
  let second: NestExpressApplication;
  let prisma: PrismaService;
  let db: PostgresRateCounters;

  beforeAll(async () => {
    first = await startApi(10);
    second = await startApi(10);
    prisma = first.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE "platform"."rate_counters"');
    db = new PostgresRateCounters(prisma);
  });

  afterAll(async () => {
    await first.close();
    await second.close();
  });

  it("mêmes résultats que la version en mémoire (fenêtre, blocage, fin du blocage, annulation)", async () => {
    const memory = new MemoryRateCounters();
    const key = `test:${randomBytes(4).toString("hex")}`;
    const script = async (counters: RateCounters) => {
      const block = { limit: 2, ms: 120_000 };
      const seen = [];
      for (const [seconds, withBlock] of [
        [0, false],
        [30, false],
        [61, false],
        [62, true],
        [63, true],
        [100, true],
        [190, true],
      ] as const) {
        const state = await counters.hit(key, 60_000, at(seconds), withBlock ? block : undefined);
        seen.push([state.hits, state.resetAt.toISOString(), state.blockedUntil?.toISOString()]);
      }
      await counters.undo(key, at(191));
      seen.push((await counters.read(key, at(191)))?.hits);
      return seen;
    };
    expect(await script(db)).toEqual(await script(memory));
  });

  it("aucun appel perdu : 40 appels en même temps donnent 40", async () => {
    const key = `test:${randomBytes(4).toString("hex")}`;
    const now = new Date();
    await Promise.all(Array.from({ length: 40 }, () => db.hit(key, 60_000, now)));
    expect((await db.read(key, now))?.hits).toBe(40);
  });

  it("ménage : seuls les compteurs terminés (fenêtre et blocage) sont effacés", async () => {
    const done = `test:${randomBytes(4).toString("hex")}`;
    const blocked = `test:${randomBytes(4).toString("hex")}`;
    await db.hit(done, 1_000, at(0));
    await db.hit(blocked, 1_000, at(0), { limit: 0, ms: 600_000 });
    await db.purge(at(10));
    const left = await prisma.$queryRaw<{ key: string }[]>`
      SELECT "key" FROM "platform"."rate_counters" WHERE "key" IN (${done}, ${blocked})`;
    expect(left.map((r) => r.key)).toEqual([blocked]);
  });

  it("deux instances de l'API : la limite par adresse est commune (10 par minute en tout)", async () => {
    // Les deux instances lisent bien les compteurs en base
    expect(first.get(RATE_COUNTERS)).toBeInstanceOf(FallbackRateCounters);
    await prisma.$executeRawUnsafe(
      `DELETE FROM "platform"."rate_counters" WHERE "key" LIKE 'limite:%'`,
    );
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const app = i % 2 === 0 ? first : second;
      statuses.push((await request(app.getHttpServer()).get("/api/v1/categories")).status);
    }
    // En mémoire, chaque instance aurait accepté 10 appels (20 en tout)
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    const blocked = await request(second.getHttpServer()).get("/api/v1/categories");
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
  });
});
