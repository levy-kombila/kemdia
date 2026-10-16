import { describe, expect, it } from "vitest";
import {
  FakeClock,
  InMemoryAccounts,
  InMemoryLoginGuards,
  InMemorySecondFactors,
  InMemorySessions,
  directTransactions,
  fakeHasher,
} from "../../../../test/identity/in-memory.js";
import type { AuditEntry } from "../../audit/index.js";
import { Account } from "../domain/account.js";
import { requireIdentifier, type Identifier } from "../domain/identifier.js";
import type { Role } from "../domain/role.js";
import { base32Decode, totpCode, totpStep } from "../domain/totp.js";
import type { SecondFactorEvent, SecretBox } from "./ports.js";
import { SecondFactorService } from "./second-factor.service.js";
import type { AuthenticatedSession } from "./session.service.js";

const ADMIN = "11111111-1111-4111-8111-111111111111";
const PASSWORD = "Mangue2026";
const CTX = { ip: "203.0.113.9", requestId: "req-2fa" };

/**
 * Faux chiffrement (la couche application ne dépend pas de l'infrastructure) : octets inversés par OU exclusif, liés
 * au compte. Le vrai AES-256-GCM est testé dans aes-secret-box.test.ts et dans second-factor.int.test.ts.
 */
class FakeSecretBox implements SecretBox {
  constructor(readonly available = true) {}
  seal(plain: Uint8Array, accountId: string): Uint8Array {
    const prefix = [...accountId.toLowerCase()].map((c) => c.charCodeAt(0));
    return Uint8Array.from(prefix.concat(Array.from(plain, (b) => b ^ 0x5a)));
  }
  open(box: Uint8Array, accountId: string): Uint8Array {
    const prefix = accountId.toLowerCase().length;
    if (String.fromCharCode(...box.subarray(0, prefix)) !== accountId.toLowerCase()) {
      throw new Error("autre compte");
    }
    return Uint8Array.from(box.subarray(prefix), (b) => b ^ 0x5a);
  }
}

async function setup(options: { box?: SecretBox } = {}) {
  const clock = new FakeClock(new Date("2026-10-15T22:00:00.000Z"));
  const factors = new InMemorySecondFactors();
  const sessions = new InMemorySessions();
  const accounts = new InMemoryAccounts();
  const guards = new InMemoryLoginGuards();
  const audit: AuditEntry[] = [];
  const notices: { to: string; event: SecondFactorEvent }[] = [];
  const account = Account.register({
    id: ADMIN,
    firstName: "Ada",
    lastName: "Mba",
    identifier: requireIdentifier("ada@exemple.ga"),
    passwordHash: `hash:${PASSWORD}`,
    now: clock.now(),
  });
  account.markVerified(requireIdentifier("ada@exemple.ga"), clock.now());
  await accounts.save(account);
  const service = new SecondFactorService(
    factors,
    sessions,
    accounts,
    guards,
    fakeHasher,
    options.box ?? new FakeSecretBox(),
    clock,
    { record: (entry: AuditEntry) => Promise.resolve(void audit.push(entry)) },
    directTransactions,
    {
      notifySecondFactor: (to: Identifier, event: SecondFactorEvent) =>
        void notices.push({ to: to.value, event }),
    },
  );
  /** Nouvelle session ; la fonction renvoyée la relit comme le ferait SessionGuard. */
  const session = (roles: Role[] = ["client", "admin"]) => {
    const openedAt = clock.now();
    const id = `s-${sessions.rows.length + 1}`;
    sessions.rows.push({
      id,
      accountId: ADMIN,
      tokenHash: id,
      expiresAt: new Date("2026-12-01T00:00:00Z"),
      lastSeenAt: openedAt,
      revokedAt: null,
      userAgent: null,
      passwordVersion: 0,
      secondFactorAt: null,
      createdAt: openedAt,
    });
    return (): AuthenticatedSession => {
      const row = sessions.rows.find((s) => s.id === id)!;
      return {
        sessionId: id,
        openedAt,
        expiresAt: row.expiresAt,
        secondFactorAt: row.secondFactorAt,
        account: {
          id: ADMIN,
          firstName: "Ada",
          lastName: "Mba",
          email: "ada@exemple.ga",
          phone: null,
          roles,
        },
      };
    };
  };
  const revoked = (current: () => AuthenticatedSession) =>
    sessions.rows.find((s) => s.id === current().sessionId)?.revokedAt !== null;
  const codeAt = (secret: string, offsetSteps = 0) =>
    totpCode(base32Decode(secret), totpStep(clock.now()) + offsetSteps);
  return {
    service,
    clock,
    factors,
    sessions,
    guards,
    accounts,
    audit,
    notices,
    session,
    revoked,
    codeAt,
  };
}

type Harness = Awaited<ReturnType<typeof setup>>;

const codeOf = (promise: Promise<unknown>) =>
  promise.then(
    () => "aucune erreur",
    (error: { code?: string }) => error.code,
  );

/** Activation complète ; renvoie le secret, les codes de secours et la session. */
async function enroll(h: Harness) {
  const current = h.session();
  const { secret } = await h.service.setup(current(), PASSWORD, CTX);
  const { recoveryCodes } = await h.service.enable(current(), h.codeAt(secret), CTX);
  return { secret, recoveryCodes, current };
}

describe("SecondFactorService : activation (S6-T03)", () => {
  it("mot de passe → QR code → premier code : activée, 10 codes de secours, session confirmée, avis", async () => {
    const h = await setup();
    const current = h.session();
    const setupResult = await h.service.setup(current(), PASSWORD, CTX);
    expect(setupResult.secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setupResult.otpauthUri).toContain("Kemdia%3Aada%40exemple.ga");
    expect(h.factors.rows.get(ADMIN)?.enabledAt).toBeNull();

    const enabled = await h.service.enable(current(), h.codeAt(setupResult.secret), CTX);
    expect(enabled.recoveryCodes).toHaveLength(10);
    expect(new Set(enabled.recoveryCodes).size).toBe(10);
    expect(enabled.verifiedUntil).toEqual(new Date(h.clock.now().getTime() + 15 * 60_000));
    expect(h.factors.codes.map((c) => c.hash)).not.toContain(enabled.recoveryCodes[0]);
    expect(current().secondFactorAt).toEqual(h.clock.now());
    expect(h.audit.map((e) => e.action)).toEqual(["mfa.enabled"]);
    // Avis à l'affichage du QR code, puis à l'activation (relecture S6-T03)
    expect(h.notices).toEqual([
      { to: "ada@exemple.ga", event: "setup" },
      { to: "ada@exemple.ga", event: "enabled" },
    ]);
    expect(await h.service.status(current())).toEqual({
      enabled: true,
      required: true,
      verifiedUntil: enabled.verifiedUntil,
      recoveryCodesLeft: 10,
    });
  });

  it("une session volée ne suffit pas : le QR code exige le mot de passe", async () => {
    const h = await setup();
    expect(await codeOf(h.service.setup(h.session()(), "mauvais", CTX))).toBe(
      "MOT_DE_PASSE_INCORRECT",
    );
    expect(await codeOf(h.service.setup(h.session()(), "x".repeat(2000), CTX))).toBe(
      "MOT_DE_PASSE_INCORRECT",
    );
    expect(h.factors.rows.size).toBe(0);
  });

  it("réservé à l'équipe (modérateurs compris) ; jamais une 2e fois", async () => {
    const h = await setup();
    expect(await codeOf(h.service.setup(h.session(["client", "vendor"])(), PASSWORD, CTX))).toBe(
      "ACCES_REFUSE",
    );
    await h.service.setup(h.session(["client", "moderator"])(), PASSWORD, CTX);
    const { current } = await enroll(h);
    expect(await codeOf(h.service.setup(current(), PASSWORD, CTX))).toBe(
      "DEUX_FACTEURS_DEJA_ACTIVE",
    );
  });

  it("premier code faux : pas d'activation ; sans QR code affiché : DEUX_FACTEURS_A_CONFIGURER", async () => {
    const h = await setup();
    const current = h.session();
    expect(await codeOf(h.service.enable(current(), "123456", CTX))).toBe(
      "DEUX_FACTEURS_A_CONFIGURER",
    );
    const { secret } = await h.service.setup(current(), PASSWORD, CTX);
    expect(await codeOf(h.service.enable(current(), h.codeAt(secret, 5), CTX))).toBe(
      "CODE_INVALIDE",
    );
    expect(h.factors.rows.get(ADMIN)?.enabledAt).toBeNull();
    // Chaque échec est journalisé (relecture S6-T03), rien d'autre
    expect(h.audit.map((e) => e.action)).toEqual(["mfa.failed"]);
  });

  it("serveur sans clé de chiffrement : DEUX_FACTEURS_INDISPONIBLE", async () => {
    const h = await setup({ box: new FakeSecretBox(false) });
    expect(await codeOf(h.service.setup(h.session()(), PASSWORD, CTX))).toBe(
      "DEUX_FACTEURS_INDISPONIBLE",
    );
    expect(await codeOf(h.service.verify(h.session()(), "123456", CTX))).toBe(
      "DEUX_FACTEURS_INDISPONIBLE",
    );
  });
});

describe("SecondFactorService : confirmation de la session (S6-T03)", () => {
  it("code suivant accepté ; le même code ne sert pas deux fois (rejeu)", async () => {
    const h = await setup();
    const { secret } = await enroll(h);
    const other = h.session();
    h.clock.advance(30_000);
    const code = h.codeAt(secret);
    const verified = await h.service.verify(other(), code, CTX);
    expect(verified.recoveryCodesLeft).toBe(10);
    expect(other().secondFactorAt).toEqual(h.clock.now());
    expect(await codeOf(h.service.verify(h.session()(), code, CTX))).toBe("CODE_INVALIDE");
  });

  it("code de secours : une seule fois, saisie tolérante, inscrit au journal", async () => {
    const h = await setup();
    const { recoveryCodes } = await enroll(h);
    const first = recoveryCodes[0]!;
    const verified = await h.service.verify(h.session()(), ` ${first.toUpperCase()} `, CTX);
    expect(verified.recoveryCodesLeft).toBe(9);
    expect(h.audit.at(-1)).toMatchObject({
      action: "mfa.recovery_used",
      details: { remaining: 9 },
    });
    expect(await codeOf(h.service.verify(h.session()(), first, CTX))).toBe("CODE_INVALIDE");
  });

  it("3e code faux : SESSION FERMÉE, codes bloqués 15 minutes, journal et avis au titulaire", async () => {
    const h = await setup();
    const { secret } = await enroll(h);
    h.clock.advance(60_000);
    const thief = h.session();
    expect(await codeOf(h.service.verify(thief(), "000000", CTX))).toBe("CODE_INVALIDE");
    expect(await codeOf(h.service.verify(thief(), "000000", CTX))).toBe("CODE_INVALIDE");
    expect(h.revoked(thief)).toBe(false);
    expect(await codeOf(h.service.verify(thief(), "000000", CTX))).toBe("TROP_D_ESSAIS");
    expect(h.revoked(thief)).toBe(true);
    expect(h.audit.at(-1)).toMatchObject({
      action: "mfa.locked",
      details: { attempts: 3, scope: "15min" },
    });
    expect(h.audit.filter((e) => e.action === "mfa.failed")).toHaveLength(3);
    expect(h.notices.at(-1)).toEqual({ to: "ada@exemple.ga", event: "locked" });
    // Même le bon code, depuis une autre session, attend la fin du blocage
    expect(await codeOf(h.service.verify(h.session()(), h.codeAt(secret), CTX))).toBe(
      "TROP_D_ESSAIS",
    );
    h.clock.advance(15 * 60_000);
    await h.service.verify(h.session()(), h.codeAt(secret), CTX);
    expect(h.guards.rows.get(`2fa:${ADMIN}`)?.attempts ?? 0).toBe(0);
  });

  it("mots de passe faux au QR code : comptés avec les codes, même blocage", async () => {
    const h = await setup();
    const current = h.session();
    await codeOf(h.service.setup(current(), "a", CTX));
    await codeOf(h.service.setup(current(), "b", CTX));
    expect(await codeOf(h.service.setup(current(), "c", CTX))).toBe("TROP_D_ESSAIS");
    expect(h.revoked(current)).toBe(true);
  });

  it("2FA pas encore activée : DEUX_FACTEURS_A_ACTIVER", async () => {
    const h = await setup();
    expect(await codeOf(h.service.verify(h.session()(), "123456", CTX))).toBe(
      "DEUX_FACTEURS_A_ACTIVER",
    );
  });
});

describe("SecondFactorService : codes de secours et remise à zéro (S6-T03)", () => {
  it("nouveaux codes contre un code FRAIS de l'application (pas un code de secours) ; avis au titulaire", async () => {
    const h = await setup();
    const { secret, recoveryCodes, current } = await enroll(h);
    // Le code d'activation est déjà utilisé ; un code de secours ne suffit pas
    expect(await codeOf(h.service.regenerateRecoveryCodes(current(), h.codeAt(secret), CTX))).toBe(
      "CODE_INVALIDE",
    );
    expect(await codeOf(h.service.regenerateRecoveryCodes(current(), recoveryCodes[0]!, CTX))).toBe(
      "CODE_INVALIDE",
    );
    h.clock.advance(30_000);
    const fresh = await h.service.regenerateRecoveryCodes(current(), h.codeAt(secret), CTX);
    expect(fresh).toHaveLength(10);
    // L'ancien code de secours ne sert plus
    expect(await codeOf(h.service.verify(h.session()(), recoveryCodes[1]!, CTX))).toBe(
      "CODE_INVALIDE",
    );
    expect(h.audit.map((e) => e.action)).toContain("mfa.recovery_regenerated");
    expect(h.notices.map((n) => n.event)).toContain("recovery-regenerated");
  });

  it("commande serveur : 2FA supprimée, TOUTES les sessions fermées, journal au nom du serveur, avis", async () => {
    const h = await setup();
    const { current } = await enroll(h);
    const other = h.session();
    expect(await h.service.resetFromServer("ADA@exemple.ga")).toEqual({
      accountId: ADMIN,
      changed: true,
    });
    expect(h.factors.rows.has(ADMIN)).toBe(false);
    expect(h.factors.codes).toEqual([]);
    expect(h.revoked(current)).toBe(true);
    expect(h.revoked(other)).toBe(true);
    expect(h.audit.at(-1)).toMatchObject({
      action: "mfa.reset",
      actor: { type: "system" },
      target: { type: "account", id: ADMIN },
      details: { source: "server", sessionsClosed: 2, password: "inutilisable" },
    });
    // Relecture S6-T03 : le mot de passe ne sert plus (un voleur qui le connaît ne se reconnecte pas)
    const account = await h.accounts.findById(ADMIN);
    expect(account?.passwordHash).not.toBe(`hash:${PASSWORD}`);
    expect(account?.passwordVersion).toBe(1);
    expect(h.notices.at(-1)).toEqual({ to: "ada@exemple.ga", event: "reset" });
    expect(await h.service.resetFromServer("ada@exemple.ga")).toEqual({
      accountId: ADMIN,
      changed: false,
    });
    expect(await codeOf(h.service.resetFromServer("inconnu@exemple.ga"))).toBe(
      "COMPTE_INTROUVABLE",
    );
  });
});

describe("SecondFactorService : relecture de sécurité (S6-T03)", () => {
  it("essais lents (2 par quart d'heure) : au 10e échec en 24 h, TOUTES les sessions sont fermées", async () => {
    const h = await setup();
    const { secret, current } = await enroll(h);
    const thief = h.session();
    for (let round = 0; round < 4; round += 1) {
      expect(await codeOf(h.service.verify(thief(), "000000", CTX))).toBe("CODE_INVALIDE");
      expect(await codeOf(h.service.verify(thief(), "000000", CTX))).toBe("CODE_INVALIDE");
      h.clock.advance(16 * 60_000);
      // Le vrai titulaire réussit entre-temps : le compteur sur 24 h ne repart pas de zéro
      h.clock.advance(30_000);
      await h.service.verify(current(), h.codeAt(secret), CTX);
    }
    expect(await codeOf(h.service.verify(thief(), "000000", CTX))).toBe("CODE_INVALIDE");
    expect(await codeOf(h.service.verify(thief(), "000000", CTX))).toBe("TROP_D_ESSAIS");
    expect(h.revoked(thief)).toBe(true);
    expect(h.revoked(current)).toBe(true);
    expect(h.audit.at(-1)).toMatchObject({
      action: "mfa.locked",
      details: { attempts: 10, scope: "24h" },
    });
    expect(h.notices.at(-1)).toEqual({ to: "ada@exemple.ga", event: "locked" });
  });

  it("QR code d'un compte déjà protégé : refus sans regarder le mot de passe (rien n'est révélé ni compté)", async () => {
    const h = await setup();
    await enroll(h);
    const current = h.session();
    expect(await codeOf(h.service.setup(current(), "mauvais", CTX))).toBe(
      "DEUX_FACTEURS_DEJA_ACTIVE",
    );
    expect(await codeOf(h.service.setup(current(), PASSWORD, CTX))).toBe(
      "DEUX_FACTEURS_DEJA_ACTIVE",
    );
    expect(h.guards.rows.get(`2fa:${ADMIN}`)?.attempts ?? 0).toBe(0);
  });

  it("code de secours utilisé : avis au titulaire", async () => {
    const h = await setup();
    const { recoveryCodes } = await enroll(h);
    await h.service.verify(h.session()(), recoveryCodes[0]!, CTX);
    expect(h.notices.at(-1)).toEqual({ to: "ada@exemple.ga", event: "recovery-used" });
  });
});
