import { describe, expect, it } from "vitest";
import {
  FakeClock,
  InMemoryAccounts,
  InMemorySessions,
} from "../../../../test/identity/in-memory.js";
import { Account } from "../domain/account.js";
import { requireIdentifier } from "../domain/identifier.js";
import { SESSION_RENEW_AFTER_MS, SESSION_TTL_MS } from "../domain/session.js";
import { SessionService } from "./session.service.js";

async function setup() {
  const accounts = new InMemoryAccounts();
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
    service: new SessionService(sessions, accounts, clock),
    sessions,
    accounts,
    clock,
    account,
  };
}

describe("Sessions (30 jours glissants)", () => {
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

  it("déconnecter tous les appareils", async () => {
    const { service, account } = await setup();
    const a = await service.open(account);
    const b = await service.open(account);
    await expect(service.logoutAll(account.id)).resolves.toBe(2);
    await expect(service.authenticate(a.token)).rejects.toMatchObject({ code: "SESSION_INVALIDE" });
    await expect(service.authenticate(b.token)).rejects.toMatchObject({ code: "SESSION_INVALIDE" });
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
