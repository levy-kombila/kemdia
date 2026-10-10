import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Actions serveur du panier : jeton lu dans le cookie (jamais reçu du navigateur), arguments revérifiés,
 * panier du navigateur nettoyé avant la réunion. `next/headers` et l'API sont remplacés.
 */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    }),
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("@/lib/config/server-config", () => ({
  catalogSource: () => ({
    url: "http://serveur.test:4000",
    key: "k".repeat(40),
    timeoutMs: 1000,
  }),
}));
const api = vi.hoisted(() => ({
  get: vi.fn(),
  add: vi.fn(),
  setQuantity: vi.fn(),
  remove: vi.fn(),
  clear: vi.fn(),
  merge: vi.fn(),
}));
vi.mock("./api-cart", () => ({ createCartApi: () => api }));

const { SESSION_COOKIE } = await import("@/lib/auth/cookies");
const { addToServerCart, clearServerCart, setServerCartQuantity, syncCart } =
  await import("./cart-actions");

const TOKEN = "T".repeat(43);
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const EMPTY = { lines: [], itemCount: 0, subtotal: 0, ok: false };
const MERGE_ID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  jar.clear();
  for (const fn of Object.values(api)) fn.mockReset();
});

describe("syncCart (au chargement du site)", () => {
  it("sans cookie de session : panier du navigateur, l'API n'est pas appelée", async () => {
    expect(await syncCart([{ variantId: A, quantity: 1 }], MERGE_ID)).toEqual({ status: "guest" });
    expect(api.get).not.toHaveBeenCalled();
    expect(api.merge).not.toHaveBeenCalled();
  });

  it("connecté sans panier local : simple lecture", async () => {
    jar.set(SESSION_COOKIE, TOKEN);
    api.get.mockResolvedValue({ ok: true, data: EMPTY });
    expect(await syncCart([])).toEqual({ status: "signed-in", cart: EMPTY, ignored: 0 });
    expect(api.get).toHaveBeenCalledWith(TOKEN);
  });

  it("connecté avec un panier local : réunion, lignes nettoyées (invalides, doublons, quantités, aucun prix)", async () => {
    jar.set(SESSION_COOKIE, TOKEN);
    api.merge.mockResolvedValue({ ok: true, data: { ...EMPTY, ignored: 2 } });
    const result = await syncCart(
      [
        { variantId: A, quantity: 2, price: 1 },
        { variantId: A, quantity: 5 },
        { variantId: "pas-un-uuid", quantity: 1 },
        { variantId: B, quantity: 99 },
        { variantId: A.toUpperCase(), quantity: 3 },
        "n'importe quoi",
      ],
      MERGE_ID.toUpperCase(),
    );
    expect(result).toEqual({ status: "signed-in", cart: EMPTY, ignored: 2 });
    expect(api.merge).toHaveBeenCalledWith(TOKEN, MERGE_ID, [
      { variantId: A, quantity: 2 },
      { variantId: B, quantity: 20 },
    ]);
  });

  it("sans identifiant de réunion valable : simple lecture, rien n'est réuni", async () => {
    jar.set(SESSION_COOKIE, TOKEN);
    api.get.mockResolvedValue({ ok: true, data: EMPTY });
    await syncCart([{ variantId: A, quantity: 1 }], "pas-un-uuid");
    await syncCart([{ variantId: A, quantity: 1 }]);
    expect(api.merge).not.toHaveBeenCalled();
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("session refusée : panier du navigateur ; API en panne : « unavailable » (rien n'est effacé)", async () => {
    jar.set(SESSION_COOKIE, TOKEN);
    api.get.mockResolvedValue({ ok: false, code: "SESSION_INVALIDE" });
    expect(await syncCart(null)).toEqual({ status: "guest" });
    api.get.mockResolvedValue({ ok: false, code: "INDISPONIBLE" });
    expect(await syncCart(undefined)).toEqual({ status: "unavailable" });
  });
});

describe("modifications du panier du compte", () => {
  it("revérifient leurs arguments avant d'appeler l'API", async () => {
    jar.set(SESSION_COOKIE, TOKEN);
    for (const [variantId, quantity] of [
      ["pas-un-uuid", 1],
      [A, 0],
      [A, 21],
      [A, 1.5],
      [A, "2"],
    ] as const) {
      expect(await addToServerCart(variantId, quantity)).toEqual({
        ok: false,
        code: "INDISPONIBLE",
      });
      expect(await setServerCartQuantity(variantId, quantity)).toEqual({
        ok: false,
        code: "INDISPONIBLE",
      });
    }
    expect(api.add).not.toHaveBeenCalled();
    expect(api.setQuantity).not.toHaveBeenCalled();
  });

  it("sans cookie : SESSION_INVALIDE ; avec : le jeton du cookie est utilisé", async () => {
    expect(await clearServerCart()).toEqual({ ok: false, code: "SESSION_INVALIDE" });
    jar.set(SESSION_COOKIE, TOKEN);
    api.add.mockResolvedValue({ ok: true, data: EMPTY });
    expect(await addToServerCart(A, 3)).toEqual({ ok: true, cart: EMPTY });
    expect(api.add).toHaveBeenCalledWith(TOKEN, A, 3);
    api.clear.mockResolvedValue({ ok: false, code: "TROP_DE_REQUETES" });
    expect(await clearServerCart()).toEqual({ ok: false, code: "TROP_DE_REQUETES" });
  });
});
