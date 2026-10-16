import { beforeEach, describe, expect, it, vi } from "vitest";

/** Garde des pages de l'équipe (S6-T05) : connexion, rôle, double authentification activée puis confirmée. */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    }),
  headers: () => Promise.resolve(new Headers()),
}));
class Stop extends Error {
  constructor(readonly to: string) {
    super(to);
  }
}
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Stop(url);
  }),
  notFound: vi.fn(() => {
    throw new Stop("404");
  }),
}));
const session = vi.hoisted(() => ({ getCurrentAccount: vi.fn(), forgetSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/config/server-config", () => ({
  catalogSource: () => ({ url: "http://serveur.test:4000", key: "k".repeat(40), timeoutMs: 1000 }),
}));
const api = vi.hoisted(() => ({ secondFactor: vi.fn() }));
vi.mock("./api-staff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api-staff")>()),
  createStaffApi: () => api,
}));

const { SESSION_COOKIE } = await import("@/lib/auth/cookies");
const { requireVerifiedStaff } = await import("./staff");

const TOKEN = "T".repeat(43);
const NOW = new Date("2026-10-16T18:00:00Z");
const signedIn = (roles: string[]) => ({
  status: "signed-in",
  account: { firstName: "Ines", lastName: "Equipe", email: null, phone: null, roles },
});
const factor = (enabled: boolean, verifiedUntil: string | null) => ({
  ok: true,
  data: { enabled, required: true, verifiedUntil, recoveryCodesLeft: 10 },
});
async function stopOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Stop) return error.to;
    throw error;
  }
  return "aucun arrêt";
}

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  jar.set(SESSION_COOKIE, TOKEN);
});

describe("requireVerifiedStaff", () => {
  it("pas connecté → connexion, avec retour à la page demandée", async () => {
    session.getCurrentAccount.mockResolvedValue({ status: "guest" });
    expect(await stopOf(requireVerifiedStaff("/equipe/moderation", "moderator", NOW))).toBe(
      "/connexion?retour=%2Fequipe%2Fmoderation",
    );
    expect(api.secondFactor).not.toHaveBeenCalled();
  });

  it("client ou vendeur → 404 ; modérateur sur une page d'administrateur → 404", async () => {
    session.getCurrentAccount.mockResolvedValue(signedIn(["client", "vendor"]));
    expect(await stopOf(requireVerifiedStaff("/equipe", "moderator", NOW))).toBe("404");
    session.getCurrentAccount.mockResolvedValue(signedIn(["client", "moderator"]));
    expect(await stopOf(requireVerifiedStaff("/equipe/boutiques", "admin", NOW))).toBe("404");
    expect(api.secondFactor).not.toHaveBeenCalled();
  });

  it("2FA pas activée → page « Sécurité » ; pas confirmée ou expirée → saisie du code", async () => {
    session.getCurrentAccount.mockResolvedValue(signedIn(["client", "admin"]));
    api.secondFactor.mockResolvedValue(factor(false, null));
    expect(await stopOf(requireVerifiedStaff("/equipe", "admin", NOW))).toBe("/equipe/securite");
    api.secondFactor.mockResolvedValue(factor(true, null));
    expect(await stopOf(requireVerifiedStaff("/equipe/boutiques", "admin", NOW))).toBe(
      "/equipe/confirmer?retour=%2Fequipe%2Fboutiques",
    );
    api.secondFactor.mockResolvedValue(factor(true, "2026-10-16T17:59:59.000Z"));
    expect(await stopOf(requireVerifiedStaff("/equipe", "admin", NOW))).toBe(
      "/equipe/confirmer?retour=%2Fequipe",
    );
  });

  it("confirmée : la page s'affiche (administrateur accepté comme modérateur)", async () => {
    session.getCurrentAccount.mockResolvedValue(signedIn(["client", "admin"]));
    api.secondFactor.mockResolvedValue(factor(true, "2026-10-16T18:10:00.000Z"));
    const staff = await requireVerifiedStaff("/equipe/moderation", "moderator", NOW);
    expect(staff.token).toBe(TOKEN);
    expect(api.secondFactor).toHaveBeenCalledWith(TOKEN);
  });

  it("session refusée par l'API → oubliée puis connexion ; rôle retiré → 404 ; API en panne → erreur", async () => {
    session.getCurrentAccount.mockResolvedValue(signedIn(["client", "moderator"]));
    api.secondFactor.mockResolvedValue({ ok: false, code: "SESSION_INVALIDE" });
    expect(await stopOf(requireVerifiedStaff("/equipe", "moderator", NOW))).toBe(
      "/connexion?retour=%2Fequipe",
    );
    // Oubliée de la mémoire du site : la page de connexion ne la croit plus ouverte (pas de boucle)
    expect(session.forgetSession).toHaveBeenCalledWith(TOKEN);
    api.secondFactor.mockResolvedValue({ ok: false, code: "ACCES_REFUSE" });
    expect(await stopOf(requireVerifiedStaff("/equipe", "moderator", NOW))).toBe("404");
    api.secondFactor.mockResolvedValue({ ok: false, code: "INDISPONIBLE" });
    await expect(requireVerifiedStaff("/equipe", "moderator", NOW)).rejects.toThrow(
      "Double authentification momentanément illisible",
    );
  });
});
