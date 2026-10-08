import { describe, expect, it } from "vitest";
import {
  FakeClock,
  InMemoryAccounts,
  InMemorySessions,
  RecordingAudit,
  directTransactions,
} from "../../../../test/identity/in-memory.js";
import { Account } from "../domain/account.js";
import { requireIdentifier } from "../domain/identifier.js";
import { SESSION_RENEW_AFTER_MS, SESSION_TTL_MS } from "../domain/session.js";
import { SessionService } from "./session.service.js";

async function setup() {
  const accounts = new InMemoryAccounts();
  const audit = new RecordingAudit();
  const sessions = new InMemorySessions();
  const clock = new FakeClock();
  const account = Account.register({
    id: "11111111-1111-4111-8111-111111111111",
    firstName: "Awa",
    lastName: "Ndong",
    identifier: requireIdentifier("awa@exemple.ga"),
    passwordHash: "hash:x",
    now: clock.now(),
  });
  account.markVerified(requireIdentifier("awa@exemple.ga"), clock.now());
  await accounts.save(account);
  return {
    service: new SessionService(sessions, accounts, clock, audit, directTransactions),
    sessions,
    accounts,
    clock,
    account,
    audit,
  };
}

describe("Sessions (30 jours glissants)", () => {
  it("la session authentifiée porte sa date d'ouverture et les rôles du compte (S4-T06)", async () => {
    const { service, account, clock } = await setup();
    const opened = await service.open(account);
    const openedAt = clock.now();
    clock.advance(3 * 60 * 60_000);
    const session = await service.authenticate(opened.token);
    expect(session.openedAt).toEqual(openedAt);
    expect(session.account.roles).toEqual(["client"]);
  });

  it("jeton remis une fois, seule son empreinte est gardée ; navigateur nettoyé", async () => {
    const { service, sessions, account } = await setup();
    const opened = await service.open(account, "Mozilla/5.0\u0000 (Android)\n" + "x".repeat(300));
    expect(JSON.stringify(sessions.rows)).not.toContain(opened.token);
    expect(sessions.rows[0]?.userAgent).toHaveLength(200);
    const ua = sessions.rows[0]?.userAgent ?? "";
    expect([...ua].some((c) => c.charCodeAt(0) < 32)).toBe(false);
    await expect(service.authenticate(opened.token)).resolves.toMatchObject({
      account: { id: account.id },
    });
  });

  it("prolongée à l'usage, au plus une fois par heure", async () => {
    const { service, sessions, clock, account } = await setup();
    const opened = await service.open(account);
    clock.advance(10 * 60_000);
    await service.authenticate(opened.token);
    expect(sessions.rows[0]?.expiresAt).toEqual(opened.expiresAt);
    clock.advance(SESSION_RENEW_AFTER_MS);
    const later = await service.authenticate(opened.token);
    expect(later.expiresAt).toEqual(new Date(clock.now().getTime() + SESSION_TTL_MS));
    expect(sessions.rows[0]?.expiresAt).toEqual(later.expiresAt);
  });

  it("expire après 30 jours sans visite", async () => {
    const { service, clock, account } = await setup();
    const opened = await service.open(account);
    clock.advance(SESSION_TTL_MS);
    await expect(service.authenticate(opened.token)).rejects.toMatchObject({
      code: "SESSION_INVALIDE",
    });
  });

  it("déconnexion immédiate ; jeton inconnu ou mal formé refusé", async () => {
    const { service, account } = await setup();
    const opened = await service.open(account);
    await service.logout(opened.token);
    await expect(service.authenticate(opened.token)).rejects.toMatchObject({
      code: "SESSION_INVALIDE",
    });
    await expect(service.authenticate("x".repeat(43))).rejects.toMatchObject({
      code: "SESSION_INVALIDE",
    });
    await expect(service.authenticate("court")).rejects.toMatchObject({ code: "SESSION_INVALIDE" });
    await expect(service.logout("court")).resolves.toBeUndefined();
  });

  it("déconnecter tous les appareils, inscrit au journal d'audit (S4-T06)", async () => {
    const { service, account, audit } = await setup();
    const a = await service.open(account);
    const b = await service.open(account);
    const context = { ip: "203.0.113.7", requestId: "req-1" };
    await expect(service.logoutAll(account.id, context)).resolves.toBe(2);
    expect(audit.entries).toEqual([
      {
        action: "sessions.revoked_all",
        actor: { type: "account", id: account.id },
        target: { type: "account", id: account.id },
        details: { count: 2 },
        context,
      },
    ]);
    await expect(service.authenticate(a.token)).rejects.toMatchObject({ code: "SESSION_INVALIDE" });
    await expect(service.authenticate(b.token)).rejects.toMatchObject({ code: "SESSION_INVALIDE" });
    // Recommencer ne ferme plus rien : aucune nouvelle ligne de journal
    await expect(service.logoutAll(account.id, context)).resolves.toBe(0);
    expect(audit.entries).toHaveLength(1);
  });

  it("compte désactivé : ses sessions ne valent plus rien", async () => {
    const { service, accounts, account } = await setup();
    const opened = await service.open(account);
    await accounts.save(Account.restore({ ...account.snapshot(), status: "disabled" }));
    await expect(service.authenticate(opened.token)).rejects.toMatchObject({
      code: "SESSION_INVALIDE",
    });
  });
});
