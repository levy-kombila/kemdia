import { describe, expect, it, vi } from "vitest";
import { NO_REQUEST } from "../../audit/index.js";
import type { AuthenticatedSession } from "../../identity/index.js";
import { PrivacyError } from "../domain/privacy.js";
import type { PersonalDataStore } from "./ports.js";
import { PrivacyService } from "./privacy.service.js";

const NOW = new Date("2026-10-19T01:00:00.000Z");
const ID = "0b0b0b0b-0000-4000-8000-000000000001";
const session = { account: { id: ID }, sessionId: "s" } as unknown as AuthenticatedSession;

function build(overrides: Partial<PersonalDataStore> = {}) {
  const calls: string[] = [];
  const store: PersonalDataStore = {
    lock: vi.fn(async () => {
      calls.push("lock");
      return { lastActiveAt: NOW, inactivityNoticeAt: null };
    }),
    blockers: vi.fn(async () => {
      calls.push("blockers");
      return [];
    }),
    collect: vi.fn(async () => ({
      identite: {},
      commandes: {},
      paiements: {},
      livraisons: {},
      boutique: {},
      journal: {},
    })),
    erase: vi.fn(async () => {
      calls.push("erase");
    }),
    inactiveToNotify: vi.fn(async () => []),
    noticedAndStillInactive: vi.fn(async () => []),
    markNotified: vi.fn(async () => true),
    ...overrides,
  };
  const confirmation = {
    confirm: vi.fn(async () => {
      calls.push("confirm");
      return { snapshot: () => ({ id: ID, email: "awa@exemple.ga", phone: null }) };
    }),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const notices = {
    notifyAccountDeleted: vi.fn(),
    notifyInactivity: vi.fn(),
    canNotify: vi.fn((contact: string) => contact.includes("@")),
  };
  const service = new PrivacyService(
    store,
    { run: (work) => work() },
    { now: () => NOW },
    confirmation as never,
    audit,
    notices,
  );
  return { service, store, calls, audit, notices, confirmation };
}

describe("PrivacyService (S7-T08)", () => {
  it("suppression : mot de passe d'abord, puis verrou, empêchements, effacement, journal, avis", async () => {
    const { service, calls, audit, notices } = build();
    await service.deleteAccount({ session, password: "x", context: NO_REQUEST });
    expect(calls).toEqual(["confirm", "lock", "blockers", "erase"]);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.deleted", details: { reason: "request" } }),
    );
    expect(notices.notifyAccountDeleted).toHaveBeenCalledWith("awa@exemple.ga");
  });

  it("suppression refusée : rien d'effacé, aucun avis", async () => {
    const { service, store, notices } = build({ blockers: async () => ["BOUTIQUE_OUVERTE"] });
    await expect(
      service.deleteAccount({ session, password: "x", context: NO_REQUEST }),
    ).rejects.toBeInstanceOf(PrivacyError);
    expect(store.erase).not.toHaveBeenCalled();
    expect(notices.notifyAccountDeleted).not.toHaveBeenCalled();
  });

  it("mot de passe faux : ni verrou ni effacement", async () => {
    const { service, store, confirmation } = build();
    confirmation.confirm.mockRejectedValueOnce(new Error("faux"));
    await expect(
      service.deleteAccount({ session, password: "x", context: NO_REQUEST }),
    ).rejects.toThrow("faux");
    expect(store.lock).not.toHaveBeenCalled();
    expect(store.erase).not.toHaveBeenCalled();
  });

  it("nuit : avis avec la date d'effacement ; compte reconnecté ou bloqué gardé", async () => {
    const notice = new Date("2026-09-01T00:00:00.000Z");
    const { service, store, notices } = build({
      inactiveToNotify: async () => [
        { id: ID, contact: "awa@exemple.ga" },
        // Mobile seul, SMS indisponible : ni avis, ni note
        { id: "sms", contact: "+241077123456" },
        // Revenu entre la lecture et l'écriture : avis non noté, pas d'e-mail
        { id: "revenu", contact: "revenu@exemple.ga" },
      ],
      markNotified: async (id) => id === ID,
      noticedAndStillInactive: async () => ["a", "b", "c"],
      lock: async (id) =>
        id === "a"
          ? { lastActiveAt: new Date("2023-01-01"), inactivityNoticeAt: notice }
          : id === "b"
            ? { lastActiveAt: new Date("2026-09-10"), inactivityNoticeAt: notice }
            : { lastActiveAt: new Date("2023-01-01"), inactivityNoticeAt: notice },
      blockers: async (id) => (id === "c" ? ["COMMANDE_EN_COURS"] : []),
    });
    const run = await service.processInactiveAccounts();
    expect(run).toEqual({ notified: 1, erased: 1, blocked: 1 });
    expect(notices.notifyInactivity).toHaveBeenCalledTimes(1);
    expect(notices.notifyInactivity).toHaveBeenCalledWith(
      "awa@exemple.ga",
      new Date("2026-11-18T01:00:00.000Z"),
    );
    expect(store.erase).toHaveBeenCalledTimes(1);
    expect(store.erase).toHaveBeenCalledWith("a", NOW);
  });
});
