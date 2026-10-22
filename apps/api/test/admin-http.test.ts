import "reflect-metadata";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AdminAccountSchema,
  AuditPageSchema,
  CurrentSessionSchema,
  ProblemDetailsSchema,
} from "@kemdia/contracts";
import { AppModule } from "../src/app.module.js";
import { loadConfig } from "../src/config/env.js";
import { DatabaseHealth } from "../src/database/database-health.js";
import { configureApp } from "../src/http/configure-app.js";
import { AUDIT_REPOSITORY } from "../src/modules/audit/application/ports.js";
import {
  ACCOUNT_REPOSITORY,
  IDENTITY_CLOCK,
  ROLE_REPOSITORY,
  SECOND_FACTOR_REPOSITORY,
  SESSION_REPOSITORY,
  TRANSACTION_RUNNER,
} from "../src/modules/identity/application/ports.js";
import { SessionService } from "../src/modules/identity/application/session.service.js";
import { Account } from "../src/modules/identity/domain/account.js";
import { requireIdentifier } from "../src/modules/identity/domain/identifier.js";
import type { StoredRole } from "../src/modules/identity/domain/role.js";
import { InMemoryAuditEvents } from "./audit/in-memory.js";
import {
  FakeClock,
  InMemoryAccounts,
  InMemoryRoles,
  InMemorySecondFactors,
  InMemorySessions,
  directTransactions,
} from "./identity/in-memory.js";

/** Routes d'administration (S4-T06) sans base : rôles, connexion récente, journal d'audit, contrat. */
const matches = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const result = schema.safeParse(body);
  if (!result.success) throw new Error(z.prettifyError(result.error));
  return result.data;
};
const codeOf = (body: unknown) => matches(ProblemDetailsSchema, body).code;

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const AWA_ID = "22222222-2222-4222-8222-222222222222";
const MODO_ID = "33333333-3333-4333-8333-333333333333";

/** L'administrateur a activé sa double authentification (S6-T03). */
function secondFactors(): InMemorySecondFactors {
  const factors = new InMemorySecondFactors();
  factors.rows.set(ADMIN_ID, {
    accountId: ADMIN_ID,
    secretBox: new Uint8Array(),
    enabledAt: new Date("2026-10-01T00:00:00Z"),
    lastUsedStep: 1,
  });
  return factors;
}

describe("API administration — rôles et journal d'audit (HTTP)", () => {
  let app: NestExpressApplication;
  let accounts: InMemoryAccounts;
  let roles: InMemoryRoles;
  let events: InMemoryAuditEvents;
  let clock: FakeClock;
  let sessions: SessionService;
  let sessionRows: InMemorySessions;
  let ip = 0;

  const http = () => request(app.getHttpServer());
  const as = (token: string | null) => {
    const auth = (r: request.Test) => {
      r.set("X-Forwarded-For", `10.2.0.${(++ip % 250) + 1}`);
      return token ? r.set("Authorization", `Bearer ${token}`) : r;
    };
    return {
      get: (url: string) => auth(http().get(url)),
      post: (url: string, body: object) => auth(http().post(url)).send(body),
      put: (url: string) => auth(http().put(url)),
      delete: (url: string) => auth(http().delete(url)),
    };
  };
  /**
   * Session ouverte ; confirmée par la double authentification sauf `confirmed: false` (S6-T03). Le vrai parcours
   * (QR code, codes) est testé dans second-factor.int.test.ts.
   */
  const tokenFor = async (id: string, { confirmed = true } = {}) => {
    const account = await accounts.findById(id);
    const opened = await sessions.open(account!);
    if (confirmed) {
      for (const row of sessionRows.rows.filter((r) => r.accountId === id)) {
        row.secondFactorAt = clock.now();
      }
    }
    return opened.token;
  };

  const addAccount = async (id: string, email: string, stored: StoredRole[]) => {
    const account = Account.register({
      id,
      firstName: "Awa",
      lastName: "Ndong",
      identifier: requireIdentifier(email),
      passwordHash: "hash:Mangue2026",
      now: clock.now(),
    });
    account.markVerified(requireIdentifier(email), clock.now());
    await accounts.save(Account.restore({ ...account.snapshot(), roles: stored }));
  };

  beforeAll(async () => {
    const config = loadConfig({ NODE_ENV: "test", LOG_LEVEL: "silent", TRUST_PROXY: "1" });
    accounts = new InMemoryAccounts();
    roles = new InMemoryRoles(accounts);
    events = new InMemoryAuditEvents();
    clock = new FakeClock();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.register(config)] })
      .overrideProvider(DatabaseHealth)
      .useValue({ check: () => Promise.resolve("ok") })
      .overrideProvider(ACCOUNT_REPOSITORY)
      .useValue(accounts)
      .overrideProvider(SESSION_REPOSITORY)
      .useValue((sessionRows = new InMemorySessions()))
      .overrideProvider(SECOND_FACTOR_REPOSITORY)
      .useValue(secondFactors())
      .overrideProvider(IDENTITY_CLOCK)
      .useValue(clock)
      .overrideProvider(ROLE_REPOSITORY)
      .useValue(roles)
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
  beforeEach(async () => {
    accounts.rows.clear();
    events.rows.length = 0;
    await addAccount(ADMIN_ID, "admin@exemple.ga", ["admin"]);
    await addAccount(AWA_ID, "awa@exemple.ga", []);
    await addAccount(MODO_ID, "modo@exemple.ga", ["catalog"]);
  });

  const ROUTES = [
    ["post", "/api/v1/admin/accounts/lookup"],
    ["put", `/api/v1/admin/accounts/${AWA_ID}/roles/vendor`],
    ["delete", `/api/v1/admin/accounts/${AWA_ID}/roles/vendor`],
    ["get", "/api/v1/admin/audit"],
  ] as const;
  const call = (token: string | null, [method, url]: (typeof ROUTES)[number]) =>
    method === "post"
      ? as(token).post(url, { identifier: "awa@exemple.ga" })
      : as(token)[method](url);

  it("sans session : 401 ; client ou modérateur : 403 ACCES_REFUSE, sur toutes les routes", async () => {
    const client = await tokenFor(AWA_ID);
    const moderator = await tokenFor(MODO_ID);
    for (const route of ROUTES) {
      expect(codeOf((await call(null, route).expect(401)).body)).toBe("SESSION_INVALIDE");
      expect(codeOf((await call(client, route).expect(403)).body)).toBe("ACCES_REFUSE");
      expect(codeOf((await call(moderator, route).expect(403)).body)).toBe("ACCES_REFUSE");
    }
    expect(events.rows).toEqual([]);
  });

  it("double authentification confirmée il y a 15 minutes ou plus, ou jamais : 403 DEUX_FACTEURS_REQUIS (S6-T03)", async () => {
    const unconfirmed = await tokenFor(ADMIN_ID, { confirmed: false });
    const admin = await tokenFor(ADMIN_ID);
    clock.advance(15 * 60_000);
    for (const route of ROUTES) {
      expect(codeOf((await call(admin, route).expect(403)).body)).toBe("DEUX_FACTEURS_REQUIS");
      expect(codeOf((await call(unconfirmed, route).expect(403)).body)).toBe(
        "DEUX_FACTEURS_REQUIS",
      );
    }
  });

  it("parcours : rechercher, accorder « vendeur », effet immédiat, retirer, tout est journalisé", async () => {
    const admin = await tokenFor(ADMIN_ID);
    const awa = await tokenFor(AWA_ID);

    const found = await as(admin)
      .post("/api/v1/admin/accounts/lookup", { identifier: "AWA@exemple.ga" })
      .expect(200);
    expect(found.headers["cache-control"]).toBe("no-store");
    expect(matches(AdminAccountSchema, found.body)).toMatchObject({
      id: AWA_ID,
      status: "active",
      roles: ["client"],
    });
    expect(JSON.stringify(found.body)).not.toContain("hash");

    const granted = await as(admin)
      .put(`/api/v1/admin/accounts/${AWA_ID}/roles/vendor`)
      .expect(200);
    expect(matches(AdminAccountSchema, granted.body).roles).toEqual(["client", "vendor"]);
    // La personne voit son nouveau rôle à la requête suivante (rôles relus à chaque requête)
    const session = await as(awa).get("/api/v1/auth/session").expect(200);
    expect(matches(CurrentSessionSchema, session.body).account.roles).toEqual(["client", "vendor"]);

    const revoked = await as(admin)
      .delete(`/api/v1/admin/accounts/${AWA_ID}/roles/vendor`)
      .expect(200);
    expect(matches(AdminAccountSchema, revoked.body).roles).toEqual(["client"]);

    expect(events.rows.map((e) => [e.action, e.actor, e.target?.id, e.details])).toEqual([
      [
        "role.granted",
        { type: "account", id: ADMIN_ID },
        AWA_ID,
        { role: "vendor", source: "api" },
      ],
      [
        "role.revoked",
        { type: "account", id: ADMIN_ID },
        AWA_ID,
        { role: "vendor", source: "api" },
      ],
    ]);
    // Adresse vue par l'API (relais de confiance) et identifiant de requête
    expect(events.rows[0]?.context.ip).toMatch(/^10\.2\.0\.\d+$/);
    expect(events.rows[0]?.context.requestId).toEqual(expect.any(String));
  });

  it("jamais « admin » par l'API, jamais sur soi-même, identifiants vérifiés", async () => {
    const admin = await tokenFor(ADMIN_ID);
    await as(admin).put(`/api/v1/admin/accounts/${AWA_ID}/roles/admin`).expect(400);
    await as(admin).put(`/api/v1/admin/accounts/${AWA_ID}/roles/client`).expect(400);
    // Ancien nom (avant S7.5-T04) : plus accepté
    await as(admin).put(`/api/v1/admin/accounts/${AWA_ID}/roles/moderator`).expect(400);
    await as(admin).put("/api/v1/admin/accounts/42/roles/vendor").expect(400);
    for (const id of [ADMIN_ID, ADMIN_ID.toUpperCase()]) {
      // Même UUID en majuscules : toujours soi-même (la base ignore la casse des UUID)
      const self = await as(admin).delete(`/api/v1/admin/accounts/${id}/roles/catalog`);
      expect(self.status).toBe(403);
      expect(codeOf(self.body)).toBe("ROLE_SUR_SOI_INTERDIT");
    }
    const unknown = await as(admin)
      .put("/api/v1/admin/accounts/44444444-4444-4444-8444-444444444444/roles/vendor")
      .expect(404);
    expect(codeOf(unknown.body)).toBe("COMPTE_INTROUVABLE");
    const lookup = await as(admin)
      .post("/api/v1/admin/accounts/lookup", { identifier: "inconnu@exemple.ga" })
      .expect(404);
    expect(codeOf(lookup.body)).toBe("COMPTE_INTROUVABLE");
    await as(admin)
      .post("/api/v1/admin/accounts/lookup", { identifier: "awa@exemple.ga", role: "admin" })
      .expect(400);
    expect(events.rows).toEqual([]);
  });

  it("rôle « admin » retiré (commande serveur) : refusé dès la requête suivante", async () => {
    const admin = await tokenFor(ADMIN_ID);
    await as(admin).get("/api/v1/admin/audit").expect(200);
    await roles.revoke(ADMIN_ID, "admin");
    expect(codeOf((await as(admin).get("/api/v1/admin/audit").expect(403)).body)).toBe(
      "ACCES_REFUSE",
    );
  });

  it("journal : conforme au contrat, du plus récent au plus ancien, pages et filtres", async () => {
    const admin = await tokenFor(ADMIN_ID);
    for (const role of ["vendor", "catalog"]) {
      await as(admin).put(`/api/v1/admin/accounts/${AWA_ID}/roles/${role}`).expect(200);
      await as(admin).delete(`/api/v1/admin/accounts/${AWA_ID}/roles/${role}`).expect(200);
    }
    const first = await as(admin).get("/api/v1/admin/audit?limit=3").expect(200);
    expect(first.headers["cache-control"]).toBe("no-store");
    const page1 = matches(AuditPageSchema, first.body);
    expect(page1.items).toHaveLength(3);
    expect(page1.items[0]).toMatchObject({
      action: "role.revoked",
      details: { role: "catalog" },
    });
    expect(page1.nextCursor).not.toBeNull();

    const second = await as(admin)
      .get(`/api/v1/admin/audit?limit=3&before=${page1.nextCursor}`)
      .expect(200);
    const page2 = matches(AuditPageSchema, second.body);
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();
    expect(new Set([...page1.items, ...page2.items].map((e) => e.id)).size).toBe(4);

    const granted = matches(
      AuditPageSchema,
      (
        await as(admin)
          .get(`/api/v1/admin/audit?action=role.granted&accountId=${AWA_ID}`)
          .expect(200)
      ).body,
    );
    expect(granted.items.map((e) => e.details.role)).toEqual(["catalog", "vendor"]);

    await as(admin).get("/api/v1/admin/audit?limit=500").expect(400);
    await as(admin).get("/api/v1/admin/audit?action=tout").expect(400);
    await as(admin).get("/api/v1/admin/audit?sql=1").expect(400);
    await as(admin)
      .get(`/api/v1/admin/audit?before=${"A".repeat(40)}`)
      .expect(400);
  });
});
