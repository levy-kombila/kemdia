import { describe, expect, it } from "vitest";
import {
  FakeClock,
  InMemoryAccounts,
  InMemoryLoginGuards,
  InMemorySessions,
  fakeHasher,
  RecordingAudit,
  directTransactions,
} from "../../../../test/identity/in-memory.js";
import { Account } from "../domain/account.js";
import { requireIdentifier } from "../domain/identifier.js";
import { LOGIN_LOCK_MS } from "../domain/login-guard.js";
import { LoginService } from "./login.service.js";
import { SessionService } from "./session.service.js";

const EMAIL = "awa@exemple.ga";

async function setup({ status = "active" }: { status?: "active" | "disabled" } = {}) {
  const accounts = new InMemoryAccounts();
  const audit = new RecordingAudit();
  const guards = new InMemoryLoginGuards();
  const sessions = new InMemorySessions();
  const clock = new FakeClock();
  const verifications: string[] = [];
  const hasher = {
    dummyHash: fakeHasher.dummyHash,
    hash: fakeHasher.hash,
    verify: (hash: string, password: string) => {
      verifications.push(hash);
      return fakeHasher.verify(hash, password);
    },
  };
  const account = Account.register({
    id: "11111111-1111-4111-8111-111111111111",
    firstName: "Awa",
    lastName: "Ndong",
    identifier: requireIdentifier(EMAIL),
    passwordHash: "hash:Mangue2026",
    now: clock.now(),
  });
  account.markVerified(requireIdentifier(EMAIL), clock.now());
  const props = account.snapshot();
  await accounts.save(Account.restore({ ...props, status }));
  const service = new LoginService(
    accounts,
    guards,
    hasher,
    clock,
    new SessionService(sessions, accounts, clock, audit, directTransactions),
  );
  return { service, guards, sessions, clock, verifications };
}

const login = (service: LoginService, identifier: string, password: string) =>
  service.login({ identifier, password, userAgent: "Firefox" });

describe("Connexion (FR-004, BR-040)", () => {
  it("bon mot de passe : session ouverte, compteur remis à zéro", async () => {
    const { service, guards, sessions } = await setup();
    await expect(login(service, EMAIL, "faux1234")).rejects.toMatchObject({
      code: "IDENTIFIANTS_INCORRECTS",
    });
    const opened = await login(service, " AWA@exemple.ga ", "Mangue2026");
    expect(opened.account).toMatchObject({ email: EMAIL, firstName: "Awa" });
    expect(opened.expiresAt.getTime() - Date.parse("2026-10-07T10:00:00Z")).toBe(
      30 * 24 * 3600_000,
    );
    expect(guards.rows.size).toBe(0);
    expect(sessions.rows).toHaveLength(1);
  });

  it("3 erreurs : la 3ᵉ annonce le blocage, même le bon mot de passe est refusé ensuite", async () => {
    const { service } = await setup();
    await expect(login(service, EMAIL, "faux1")).rejects.toMatchObject({
      code: "IDENTIFIANTS_INCORRECTS",
    });
    await expect(login(service, EMAIL, "faux2")).rejects.toMatchObject({
      code: "IDENTIFIANTS_INCORRECTS",
    });
    await expect(login(service, EMAIL, "faux3")).rejects.toMatchObject({
      code: "COMPTE_BLOQUE",
      retryAfterSeconds: LOGIN_LOCK_MS / 1000,
    });
    await expect(login(service, EMAIL, "Mangue2026")).rejects.toMatchObject({
      code: "COMPTE_BLOQUE",
    });
  });

  it("15 minutes plus tard, la connexion est de nouveau possible", async () => {
    const { service, clock } = await setup();
    for (const p of ["faux1", "faux2", "faux3"])
      await login(service, EMAIL, p).catch(() => undefined);
    clock.advance(LOGIN_LOCK_MS);
    await expect(login(service, EMAIL, "Mangue2026")).resolves.toBeDefined();
  });

  it("adresse sans compte : mêmes réponses, même blocage, même hachage vérifié (durée identique)", async () => {
    const { service, verifications } = await setup();
    const unknown = "personne@exemple.ga";
    await expect(login(service, unknown, "Mangue2026")).rejects.toMatchObject({
      code: "IDENTIFIANTS_INCORRECTS",
    });
    await expect(login(service, unknown, "x")).rejects.toMatchObject({
      code: "IDENTIFIANTS_INCORRECTS",
    });
    await expect(login(service, unknown, "y")).rejects.toMatchObject({ code: "COMPTE_BLOQUE" });
    // Un hachage est toujours vérifié : le hachage factice, aux mêmes réglages, pour une adresse inconnue
    expect(verifications).toEqual([
      fakeHasher.dummyHash,
      fakeHasher.dummyHash,
      fakeHasher.dummyHash,
    ]);
  });

  it("le blocage d'une adresse ne touche pas les autres", async () => {
    const { service } = await setup();
    for (const p of ["a", "b", "c"])
      await login(service, "autre@exemple.ga", p).catch(() => undefined);
    await expect(login(service, EMAIL, "Mangue2026")).resolves.toBeDefined();
  });

  it("compte désactivé : message à part SEULEMENT avec le bon mot de passe", async () => {
    const { service } = await setup({ status: "disabled" });
    await expect(login(service, EMAIL, "faux")).rejects.toMatchObject({
      code: "IDENTIFIANTS_INCORRECTS",
    });
    await expect(login(service, EMAIL, "Mangue2026")).rejects.toMatchObject({
      code: "COMPTE_DESACTIVE",
    });
  });

  it("identifiant mal formé ou mot de passe trop long : refus sans hacher", async () => {
    const { service, verifications } = await setup();
    await expect(login(service, "bonjour", "x")).rejects.toMatchObject({
      code: "IDENTIFIANT_INVALIDE",
    });
    await expect(login(service, EMAIL, "a".repeat(129))).rejects.toMatchObject({
      code: "IDENTIFIANTS_INCORRECTS",
    });
    expect(verifications).toHaveLength(0);
  });

  it("une connexion réussie n'efface pas un blocage posé en parallèle", async () => {
    const { service, guards, clock } = await setup();
    // Blocage posé par d'autres tentatives pendant que la bonne est en cours
    await guards.claim(EMAIL, clock.now());
    for (let i = 0; i < 3; i++) await guards.claim(EMAIL, clock.now());
    await guards.reset(EMAIL, clock.now());
    await expect(login(service, EMAIL, "Mangue2026")).rejects.toMatchObject({
      code: "COMPTE_BLOQUE",
    });
  });
});
