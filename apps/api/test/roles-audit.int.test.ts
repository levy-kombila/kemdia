import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/env.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { TransactionContext } from "../src/database/transaction-context.js";
import { AuditLog, AuditReader } from "../src/modules/audit/index.js";
import { PrismaAuditRepository } from "../src/modules/audit/infrastructure/prisma-audit.repository.js";
import { RoleService } from "../src/modules/identity/application/role.service.js";
import { Account } from "../src/modules/identity/domain/account.js";
import { requireIdentifier } from "../src/modules/identity/domain/identifier.js";
import { PrismaAccountRepository } from "../src/modules/identity/infrastructure/prisma-account.repository.js";
import { PrismaRoleRepository } from "../src/modules/identity/infrastructure/prisma-role.repository.js";
import { FakeClock } from "./identity/in-memory.js";
import { testDatabaseUrl } from "./integration-db.js";

/**
 * Rôles et journal d'audit sur une VRAIE base (S4-T06) : transaction commune aux deux modules,
 * table du journal en ajout seul, pagination. Le journal n'est jamais vidé (la base l'interdit) :
 * chaque test filtre ses lignes par un identifiant de requête unique.
 */
const config = loadConfig({
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL: testDatabaseUrl(),
});
const prisma = new PrismaService(config);
const transactions = new TransactionContext(prisma);
const auditRepository = new PrismaAuditRepository(transactions);
const audit = new AuditLog(auditRepository);
const reader = new AuditReader(auditRepository);
const accounts = new PrismaAccountRepository(prisma);
const roles = new PrismaRoleRepository(transactions);
const clock = new FakeClock();
const service = new RoleService(accounts, roles, clock, audit, transactions);

const ADMIN = { accountId: "", roles: ["client", "admin"] as const };

async function addAccount(email: string, status: "active" | "pending" = "active") {
  const account = Account.register({
    id: randomUUID(),
    firstName: "Awa",
    lastName: "Ndong",
    identifier: requireIdentifier(email),
    passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$c2Vs$aGFjaGFnZQ",
    now: clock.now(),
  });
  if (status === "active") account.markVerified(requireIdentifier(email), clock.now());
  await accounts.save(account);
  return account.id;
}

const traceOf = (requestId: string) =>
  prisma.auditEvent.findMany({ where: { requestId }, orderBy: { occurredAt: "asc" } });

let adminId = "";
let awaId = "";
beforeEach(async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "identity"."account_roles", "identity"."sessions", "identity"."reset_tickets", "identity"."accounts" CASCADE',
  );
  adminId = await addAccount("admin@exemple.ga");
  awaId = await addAccount("awa@exemple.ga");
  await roles.grant(adminId, "admin", null, clock.now());
  ADMIN.accountId = adminId;
});
afterAll(() => prisma.$disconnect());

describe("rôles (PostgreSQL)", () => {
  it("accorder : rôle relu avec le compte, ligne de journal complète dans la même transaction", async () => {
    const requestId = `int-${randomUUID()}`;
    const view = await service.grant(ADMIN, awaId, "vendor", { ip: "203.0.113.20", requestId });
    expect(view.roles).toEqual(["client", "vendor"]);
    expect((await accounts.findById(awaId))?.roles).toEqual(["client", "vendor"]);
    const row = await prisma.accountRole.findUniqueOrThrow({
      where: { accountId_role: { accountId: awaId, role: "VENDOR" } },
    });
    expect(row.grantedBy).toBe(adminId);
    expect(await traceOf(requestId)).toMatchObject([
      {
        action: "role.granted",
        actorType: "ACCOUNT",
        actorId: adminId,
        targetType: "account",
        targetId: awaId,
        details: { role: "vendor", source: "api" },
        ip: "203.0.113.20",
      },
    ]);
  });

  it("si l'écriture du journal échoue, le rôle n'est PAS accordé (transaction commune)", async () => {
    const failing = {
      record: () => Promise.reject(new Error("journal indisponible")),
    };
    const broken = new RoleService(accounts, roles, clock, failing, transactions);
    await expect(
      broken.grant(ADMIN, awaId, "catalog", { ip: null, requestId: null }),
    ).rejects.toThrow("journal indisponible");
    expect(await prisma.accountRole.count({ where: { accountId: awaId } })).toBe(0);
  });

  it("deux attributions simultanées : un seul rôle, une seule ligne de journal", async () => {
    const requestId = `int-${randomUUID()}`;
    const ctx = { ip: null, requestId };
    await Promise.all([
      service.grant(ADMIN, awaId, "catalog", ctx),
      service.grant(ADMIN, awaId, "catalog", ctx),
    ]);
    expect(await prisma.accountRole.count({ where: { accountId: awaId } })).toBe(1);
    expect(await traceOf(requestId)).toHaveLength(1);
  });

  it("statut relu sous verrou : compte fermé ou supprimé → aucun rôle, aucune trace", async () => {
    await prisma.account.update({ where: { id: awaId }, data: { status: "DISABLED" } });
    await expect(roles.grant(awaId, "vendor", adminId, clock.now())).resolves.toBe("inactive");
    await expect(roles.grant(randomUUID(), "vendor", adminId, clock.now())).resolves.toBe(
      "missing",
    );
    await expect(
      service.grant(ADMIN, awaId, "vendor", { ip: null, requestId: null }),
    ).rejects.toMatchObject({ code: "COMPTE_INACTIF" });
    expect(await prisma.accountRole.count({ where: { accountId: awaId } })).toBe(0);
  });

  it("CRIT-06 en base : un rôle ne peut pas être accordé par son propre titulaire", async () => {
    await expect(
      prisma.accountRole.create({ data: { accountId: awaId, role: "VENDOR", grantedBy: awaId } }),
    ).rejects.toThrow();
  });

  it("commande serveur : premier administrateur, acteur « system » ; compte supprimé → rôles supprimés", async () => {
    const before = new Date(Date.now() - 1_000);
    await expect(service.grantAdminFromServer("awa@exemple.ga")).resolves.toEqual({
      accountId: awaId,
      changed: true,
    });
    const traces = await prisma.auditEvent.findMany({
      where: { targetId: awaId, occurredAt: { gte: before } },
    });
    expect(traces).toMatchObject([
      { action: "role.granted", actorType: "SYSTEM", actorId: null, details: { role: "admin" } },
    ]);
    await prisma.account.delete({ where: { id: awaId } });
    expect(await prisma.accountRole.count({ where: { accountId: awaId } })).toBe(0);
    // Le journal survit au compte (pas de clé étrangère)
    expect(await prisma.auditEvent.count({ where: { targetId: awaId } })).toBeGreaterThan(0);
  });
});

describe("journal d'audit (PostgreSQL)", () => {
  it("ajout seul : modification, suppression récente et TRUNCATE refusés par la base", async () => {
    const requestId = `int-${randomUUID()}`;
    await audit.record({
      action: "sessions.revoked_all",
      actor: { type: "account", id: awaId },
      target: { type: "account", id: awaId },
      details: { count: 1 },
      context: { ip: null, requestId },
    });
    const [row] = await traceOf(requestId);
    await expect(
      prisma.auditEvent.update({ where: { id: row!.id }, data: { action: "role.revoked" } }),
    ).rejects.toThrow();
    await expect(prisma.auditEvent.delete({ where: { id: row!.id } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('TRUNCATE "audit"."events"')).rejects.toThrow();
    expect(await traceOf(requestId)).toHaveLength(1);
  });

  it("la date vient de la base : une ligne ne peut pas être antidatée, la purge ne la touche pas", async () => {
    const id = randomUUID();
    await prisma.auditEvent.create({
      data: { id, action: "role.granted", actorType: "SYSTEM", occurredAt: new Date("2020-01-01") },
    });
    const row = await prisma.auditEvent.findUniqueOrThrow({ where: { id } });
    expect(Date.now() - row.occurredAt.getTime()).toBeLessThan(60_000);
    await auditRepository.purgeExpired(1_000);
    expect(await prisma.auditEvent.count({ where: { id } })).toBe(1);
  });

  it("contraintes : action au bon format, acteur cohérent, détails limités", async () => {
    const base = { id: randomUUID(), actorType: "SYSTEM" as const };
    await expect(
      prisma.auditEvent.create({ data: { ...base, action: "DROP TABLE" } }),
    ).rejects.toThrow();
    await expect(
      prisma.auditEvent.create({ data: { ...base, action: "role.granted", actorId: awaId } }),
    ).rejects.toThrow();
    await expect(
      prisma.auditEvent.create({
        data: { ...base, action: "role.granted", details: { note: "x".repeat(5_000) } },
      }),
    ).rejects.toThrow();
  });

  it("lecture : du plus récent au plus ancien, filtres et pages sans trou ni doublon", async () => {
    const target = await addAccount(`page-${randomUUID().slice(0, 8)}@exemple.ga`);
    for (let i = 0; i < 5; i++) {
      await audit.record({
        action: i % 2 ? "role.revoked" : "role.granted",
        actor: { type: "account", id: adminId },
        target: { type: "account", id: target },
        details: { role: "vendor", source: "api" },
        context: { ip: null, requestId: `page-${i}` },
      });
    }
    const first = await reader.list({ limit: 3, accountId: target });
    const last = first.at(-1)!;
    const second = await reader.list({
      limit: 3,
      accountId: target,
      before: { occurredAt: last.occurredAt, id: last.id },
    });
    const all = [...first, ...second];
    expect(all.map((e) => e.context.requestId).sort()).toEqual(
      ["page-0", "page-1", "page-2", "page-3", "page-4"].sort(),
    );
    expect(new Set(all.map((e) => e.id)).size).toBe(5);
    expect(all.every((e, i) => i === 0 || all[i - 1]!.occurredAt >= e.occurredAt)).toBe(true);

    const revoked = await reader.list({ limit: 10, accountId: target, action: "role.revoked" });
    expect(revoked).toHaveLength(2);
    expect(revoked[0]).toMatchObject({
      actor: { type: "account", id: adminId },
      target: { type: "account", id: target },
      details: { role: "vendor", source: "api" },
    });
  });
});
