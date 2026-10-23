import { describe, expect, it, vi } from "vitest";
import { NO_REQUEST } from "../../audit/index.js";
import type { AuthenticatedSession } from "../../identity/index.js";
import { PrivacyError } from "../domain/privacy.js";
import type { LockedAccount, PersonalDataStore } from "./ports.js";
import { PrivacyService } from "./privacy.service.js";

const NOW = new Date("2026-10-19T01:00:00.000Z");
const ID = "0b0b0b0b-0000-4000-8000-000000000001";
const session = { account: { id: ID }, sessionId: "s" } as unknown as AuthenticatedSession;

function build(overrides: Partial<PersonalDataStore> = {}) {
  const calls: string[] = [];
  const lock = vi.fn((): Promise<LockedAccount | null> => {
    calls.push("lock");
    return Promise.resolve({ lastActiveAt: NOW, inactivityNoticeAt: null });
  });
  const erase = vi.fn((): Promise<void> => {
    calls.push("erase");
    return Promise.resolve();
  });
  const store: PersonalDataStore = {
    lock,
    blockers: () => {
      calls.push("blockers");
      return Promise.resolve([]);
    },
    collect: () =>
      Promise.resolve({
        identite: {},
        commandes: {},
        paiements: {},
        livraisons: {},
        boutique: {},
        journal: {},
        avis: [],
        signalements: [],
      }),
    erase,
    inactiveToNotify: () => Promise.resolve([]),
    noticedAndStillInactive: () => Promise.resolve([]),
    markNotified: () => Promise.resolve(true),
    ...overrides,
  };
  const confirm = vi.fn(() => {
    calls.push("confirm");
    return Promise.resolve({
      snapshot: () => ({ id: ID, email: "awa@exemple.ga", phone: null }),
    });
  });
  const record = vi.fn(() => Promise.resolve());
  const notifyAccountDeleted = vi.fn();
  const notifyInactivity = vi.fn();
  const service = new PrivacyService(
    store,
    { run: (work) => work() },
    { now: () => NOW },
    { confirm } as never,
    { record },
    {
      notifyAccountDeleted,
      notifyInactivity,
      canNotify: (contact: string) => contact.includes("@"),
    },
  );
  return { service, calls, lock, erase, confirm, record, notifyAccountDeleted, notifyInactivity };
}

describe("PrivacyService (S7-T08)", () => {
  it("suppression : mot de passe d'abord, puis verrou, empêchements, effacement, journal, avis", async () => {
    const { service, calls, record, notifyAccountDeleted } = build();
    await service.deleteAccount({ session, password: "x", context: NO_REQUEST });
    expect(calls).toEqual(["confirm", "lock", "blockers", "erase"]);
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.deleted", details: { reason: "request" } }),
    );
    expect(notifyAccountDeleted).toHaveBeenCalledWith("awa@exemple.ga");
  });

  it("suppression refusée : rien d'effacé, aucun avis", async () => {
    const { service, erase, notifyAccountDeleted } = build({
      blockers: () => Promise.resolve(["BOUTIQUE_OUVERTE"]),
    });
    await expect(
      service.deleteAccount({ session, password: "x", context: NO_REQUEST }),
    ).rejects.toBeInstanceOf(PrivacyError);
    expect(erase).not.toHaveBeenCalled();
    expect(notifyAccountDeleted).not.toHaveBeenCalled();
  });

  it("mot de passe faux : ni verrou ni effacement", async () => {
    const { service, lock, erase, confirm } = build();
    confirm.mockRejectedValueOnce(new Error("faux"));
    await expect(
      service.deleteAccount({ session, password: "x", context: NO_REQUEST }),
    ).rejects.toThrow("faux");
    expect(lock).not.toHaveBeenCalled();
    expect(erase).not.toHaveBeenCalled();
  });

  it("nuit : avis avec la date d'effacement ; compte reconnecté ou bloqué gardé", async () => {
    const notice = new Date("2026-09-01T00:00:00.000Z");
    const old = new Date("2023-01-01");
    const { service, erase, notifyInactivity } = build({
      inactiveToNotify: () =>
        Promise.resolve([
          { id: ID, contact: "awa@exemple.ga" },
          // Mobile seul, SMS indisponible : ni avis, ni note
          { id: "sms", contact: "+241077123456" },
          // Revenu entre la lecture et l'écriture : avis non noté, pas d'e-mail
          { id: "revenu", contact: "revenu@exemple.ga" },
        ]),
      markNotified: (id) => Promise.resolve(id === ID),
      noticedAndStillInactive: () => Promise.resolve(["a", "b", "c"]),
      lock: (id) =>
        Promise.resolve({
          lastActiveAt: id === "b" ? new Date("2026-09-10") : old,
          inactivityNoticeAt: notice,
        }),
      blockers: (id) => Promise.resolve(id === "c" ? ["COMMANDE_EN_COURS"] : []),
    });
    const run = await service.processInactiveAccounts();
    expect(run).toEqual({ notified: 1, erased: 1, blocked: 1 });
    expect(notifyInactivity).toHaveBeenCalledTimes(1);
    expect(notifyInactivity).toHaveBeenCalledWith(
      "awa@exemple.ga",
      new Date("2026-11-18T01:00:00.000Z"),
    );
    expect(erase).toHaveBeenCalledTimes(1);
    expect(erase).toHaveBeenCalledWith("a", NOW);
  });
});
