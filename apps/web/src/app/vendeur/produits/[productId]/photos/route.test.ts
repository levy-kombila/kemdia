import { beforeEach, describe, expect, it, vi } from "vitest";

/** Relais d'envoi des photos (S6-T06) : taille bornée, type lu dans les octets, rien d'autre n'est transmis. */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      set: (name: string, value: string) => (value ? jar.set(name, value) : jar.delete(name)),
    }),
  headers: () => Promise.resolve(new Headers()),
}));
const session = vi.hoisted(() => ({ getCurrentAccount: vi.fn(), forgetSession: vi.fn() }));
vi.mock("@/lib/auth/session", () => session);
vi.mock("@/lib/config/server-config", () => ({
  catalogSource: () => ({ url: "http://serveur.test:4000", key: "k".repeat(40), timeoutMs: 1000 }),
}));
const api = vi.hoisted(() => ({ addImage: vi.fn() }));
vi.mock("@/lib/vendor/api-vendor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/vendor/api-vendor")>()),
  createVendorApi: () => api,
}));

const { SESSION_COOKIE } = await import("@/lib/auth/cookies");
const { POST } = await import("./route");

const TOKEN = "T".repeat(43);
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

const post = (body: BodyInit, productId = PRODUCT, headers: Record<string, string> = {}) =>
  POST(new Request("http://site.test/x", { method: "POST", body, headers }), {
    params: Promise.resolve({ productId }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  jar.set(SESSION_COOKIE, TOKEN);
  session.getCurrentAccount.mockResolvedValue({ status: "signed-in", account: {} });
});

describe("POST /vendeur/produits/{id}/photos", () => {
  it("relaie une photo reconnue, avec son vrai type", async () => {
    api.addImage.mockResolvedValue({ ok: true, data: {} });
    const response = await post(JPEG, PRODUCT, { "content-type": "image/png" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(api.addImage).toHaveBeenCalledWith(TOKEN, PRODUCT, JPEG, "image/jpeg");
  });

  it("refuse sans rien transmettre : pas de session, produit inventé, autre format, trop lourd", async () => {
    expect((await post(JPEG, "../../admin")).status).toBe(404);
    expect((await post(new TextEncoder().encode("<svg onload=alert(1)>"))).status).toBe(415);
    expect((await post(new Uint8Array(5 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await post(JPEG, PRODUCT, { "content-length": String(50_000_000) })).status).toBe(413);
    jar.clear();
    const signedOut = await post(JPEG);
    expect(signedOut.status).toBe(401);
    expect(await signedOut.json()).toMatchObject({ ok: false, signedOut: true });
    expect(api.addImage).not.toHaveBeenCalled();
  });

  it("faux cookie : refusé AVANT de lire le corps, cookie effacé (relecture S6-T06)", async () => {
    session.getCurrentAccount.mockResolvedValue({ status: "stale" });
    const body = new ReadableStream({
      pull() {
        throw new Error("le corps ne doit pas être lu");
      },
    });
    const response = await POST(
      new Request("http://site.test/x", { method: "POST", body, duplex: "half" } as RequestInit),
      { params: Promise.resolve({ productId: PRODUCT }) },
    );
    expect(response.status).toBe(401);
    expect(session.forgetSession).toHaveBeenCalledWith(TOKEN);
    expect(jar.has(SESSION_COOKIE)).toBe(false);
    jar.set(SESSION_COOKIE, "pas-un-jeton");
    expect((await post(JPEG)).status).toBe(401);
    expect(api.addImage).not.toHaveBeenCalled();
  });

  it("délai dépassé côté API : prévient que la photo a peut-être été ajoutée", async () => {
    api.addImage.mockResolvedValue({ ok: false, code: "INDISPONIBLE" });
    const response = await post(JPEG);
    expect(response.status).toBe(503);
    expect((await response.json()).message).toMatch(/rechargez la page avant de la renvoyer/);
  });

  it("refus de l'API : message du site, jamais la réponse brute", async () => {
    api.addImage.mockResolvedValue({ ok: false, code: "TROP_DE_PHOTOS" });
    const response = await post(JPEG);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      ok: false,
      message: "10 photos au plus par produit : retirez-en une avant d'en ajouter.",
    });
  });
});
