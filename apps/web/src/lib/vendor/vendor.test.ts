import { beforeEach, describe, expect, it, vi } from "vitest";

/** Garde des pages de produits (S6-T06) : connecté, boutique active ; sinon l'accueil de l'espace vendeur. */
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
}));
const session = vi.hoisted(() => ({ getCurrentAccount: vi.fn(), forgetSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/config/server-config", () => ({
  catalogSource: () => ({ url: "http://serveur.test:4000", key: "k".repeat(40), timeoutMs: 1000 }),
}));
const api = vi.hoisted(() => ({ shop: vi.fn() }));
vi.mock("./api-vendor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api-vendor")>()),
  createVendorApi: () => api,
}));

const { SESSION_COOKIE } = await import("@/lib/auth/cookies");
const { requireActiveVendor } = await import("./vendor");

const TOKEN = "T".repeat(43);
const account = { firstName: "Fatou", lastName: "V", email: null, phone: null, roles: ["client"] };
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
  session.getCurrentAccount.mockResolvedValue({ status: "signed-in", account });
});

describe("requireActiveVendor", () => {
  it("pas connecté → connexion avec retour à la page", async () => {
    session.getCurrentAccount.mockResolvedValue({ status: "guest" });
    expect(await stopOf(requireActiveVendor("/vendeur/produits"))).toBe(
      "/connexion?retour=%2Fvendeur%2Fproduits",
    );
    expect(api.shop).not.toHaveBeenCalled();
  });

  it.each(["pending", "rejected", "suspended"])(
    "boutique %s → accueil de l'espace vendeur",
    async (status) => {
      api.shop.mockResolvedValue({ ok: true, data: { status } });
      expect(await stopOf(requireActiveVendor("/vendeur/produits"))).toBe("/vendeur");
    },
  );

  it("pas de boutique → accueil (la demande) ; boutique active → la page s'affiche", async () => {
    api.shop.mockResolvedValue({ ok: false, code: "BOUTIQUE_INTROUVABLE" });
    expect(await stopOf(requireActiveVendor("/vendeur/produits"))).toBe("/vendeur");
    api.shop.mockResolvedValue({ ok: true, data: { status: "active", name: "Boutique" } });
    const vendor = await requireActiveVendor("/vendeur/produits");
    expect(vendor).toMatchObject({ token: TOKEN, shop: { status: "active" } });
  });

  it("session refusée par l'API → oubliée, puis connexion (pas de boucle) ; panne → erreur", async () => {
    api.shop.mockResolvedValue({ ok: false, code: "SESSION_INVALIDE" });
    expect(await stopOf(requireActiveVendor("/vendeur"))).toBe("/connexion?retour=%2Fvendeur");
    expect(session.forgetSession).toHaveBeenCalledWith(TOKEN);
    api.shop.mockResolvedValue({ ok: false, code: "INDISPONIBLE" });
    await expect(requireActiveVendor("/vendeur")).rejects.toThrow(
      "Boutique momentanément illisible",
    );
  });
});
