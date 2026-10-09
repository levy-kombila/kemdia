import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ProblemDetailsSchema } from "@kemdia/contracts";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { DatabaseHealth } from "../src/database/database-health.js";
import { configureApp } from "../src/http/configure-app.js";
import { AUDIT_REPOSITORY } from "../src/modules/audit/application/ports.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  LOGIN_GUARD_REPOSITORY,
  ROLE_REPOSITORY,
  SESSION_REPOSITORY,
  TRANSACTION_RUNNER,
} from "../src/modules/identity/application/ports.js";
import { SessionService } from "../src/modules/identity/application/session.service.js";
import { Account } from "../src/modules/identity/domain/account.js";
import { requireIdentifier } from "../src/modules/identity/domain/identifier.js";
import { InMemoryAuditEvents } from "./audit/in-memory.js";
import {
  FakeClock,
  InMemoryAccounts,
  InMemoryLoginGuards,
  InMemoryRoles,
  InMemorySessions,
  directTransactions,
} from "./identity/in-memory.js";

/** Limites par visiteur (transmis par le site) et par compte (S4-T07, MED-05). */
const KEY = "K".repeat(40);
const SITE = { "x-kemdia-internal-key": KEY };

describe("limites par visiteur et par compte (HTTP)", () => {
  let app: NestExpressApplication;
  let accounts: InMemoryAccounts;
  let events: InMemoryAuditEvents;
  let sessions: SessionService;
  let n = 0;

  const http = () => request(app.getHttpServer());
  const login = (headers: Record<string, string>) =>
    http()
      .post("/api/v1/auth/login")
      .set(headers)
      .send({ identifier: `personne${++n}@exemple.ga`, password: "Mangue2026" });

  const newAccount = async (email: string, roles: ("admin" | "vendor")[] = []) => {
    const clock = new FakeClock(new Date());
    const account = Account.register({
      id: crypto.randomUUID(),
      firstName: "Awa",
      lastName: "Ndong",
      identifier: requireIdentifier(email),
      passwordHash: "hash:Mangue2026",
      now: clock.now(),
    });
    account.markVerified(requireIdentifier(email), clock.now());
    await accounts.save(Account.restore({ ...account.snapshot(), roles }));
    const stored = (await accounts.findById(account.id))!;
    return { id: account.id, token: (await sessions.open(stored)).token };
  };

  beforeAll(async () => {
    const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", API_INTERNAL_KEY: KEY });
    accounts = new InMemoryAccounts();
    events = new InMemoryAuditEvents();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
      .overrideProvider(DatabaseHealth)
      .useValue({ check: () => Promise.resolve("ok") })
      .overrideProvider(ACCOUNT_REPOSITORY)
      .useValue(accounts)
      .overrideProvider(SESSION_REPOSITORY)
      .useValue(new InMemorySessions())
      .overrideProvider(LOGIN_GUARD_REPOSITORY)
      .useValue(new InMemoryLoginGuards())
      .overrideProvider(IDENTITY_CLOCK)
      .useValue(new FakeClock(new Date()))
      .overrideProvider(ROLE_REPOSITORY)
      .useValue(new InMemoryRoles(accounts))
      .overrideProvider(TRANSACTION_RUNNER)
      .useValue(directTransactions)
      .overrideProvider(AUDIT_REPOSITORY)
      .useValue(events)
      .compile();
    app = moduleRef.createNestApplication<NestExpressApplication>({ logger: false });
    configureApp(app, config);
    await app.init();
    sessions = app.get(SessionService);
  });
  afterAll(async () => {
    await app.close();
  });

  it("le site pour un visiteur : 10 connexions par minute PAR VISITEUR, les autres visiteurs passent", async () => {
    const visitorA = { ...SITE, "x-kemdia-client-ip": "203.0.113.10" };
    for (let i = 0; i < 10; i++) expect((await login(visitorA)).status).toBe(401);
    const blocked = await login(visitorA);
    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect((await login({ ...SITE, "x-kemdia-client-ip": "203.0.113.11" })).status).toBe(401);
  });

  it("l'en-tête visiteur sans la clé interne ne sert à rien (on ne change pas d'adresse pour contourner)", async () => {
    // Appels directs (sans clé) depuis la même adresse, en changeant l'en-tête visiteur à chaque fois
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push((await login({ "x-kemdia-client-ip": `198.51.100.${i}` })).status);
    expect(statuses.at(-1)).toBe(429);
  });

  it("par compte : « tous mes appareils » 5 fois par minute, même via le site sans visiteur", async () => {
    await newAccount("tous@exemple.ga");
    // Chaque appel ferme toutes les sessions : on en rouvre une à chaque fois pour rester connecté
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const fresh = await newAccountSession("tous@exemple.ga");
      const res = await http()
        .post("/api/v1/auth/logout-all")
        .set(SITE)
        .set("Authorization", `Bearer ${fresh}`);
      statuses.push(res.status);
      if (res.status === 429) {
        expect(ProblemDetailsSchema.parse(res.body).code).toBe("TROP_DE_REQUETES");
        expect(Number(res.headers["retry-after"])).toBeGreaterThan(0);
      }
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
  });

  it("la limite par compte suit le compte, pas l'appareil ; un autre compte n'est pas touché", async () => {
    const other = await newAccount("autre@exemple.ga");
    await http()
      .post("/api/v1/auth/logout-all")
      .set(SITE)
      .set("Authorization", `Bearer ${other.token}`)
      .expect(200);
  });

  it("journal d'audit : l'adresse enregistrée est celle du visiteur transmise par le site", async () => {
    const { id, token } = await newAccount("journal@exemple.ga");
    await http()
      .post("/api/v1/auth/logout-all")
      .set({ ...SITE, "x-kemdia-client-ip": "203.0.113.77" })
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    const entry = events.rows.find((e) => e.actor.type === "account" && e.actor.id === id);
    expect(entry?.context.ip).toBe("203.0.113.77");
  });

  async function newAccountSession(email: string): Promise<string> {
    const account = (await accounts.findByIdentifier(requireIdentifier(email)))!;
    return (await sessions.open(account)).token;
  }
});
