import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Actions serveur du tunnel et de « Mes commandes » (S5-T07) : jeton lu dans le cookie (jamais reçu du navigateur),
 * arguments revérifiés avant tout appel. `next/headers`, `next/cache` et l'API sont remplacés.
 */
const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    }),
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentAccount: vi.fn() }));
vi.mock("@/lib/config/server-config", () => ({
  catalogSource: () => ({ url: "http://serveur.test:4000", key: "k".repeat(40), timeoutMs: 1000 }),
}));
const api = vi.hoisted(() => ({
  quote: vi.fn(),
  create: vi.fn(),
  startPayment: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("./api-orders", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api-orders")>()),
  createOrdersApi: () => api,
}));

const { SESSION_COOKIE } = await import("@/lib/auth/cookies");
const { cancelOrder, placeOrder, quoteOrder, retryPayment } = await import("./order-actions");

const TOKEN = "T".repeat(43);
const REF = "KMD-7F3K9Q";
const KEY = "44444444-4444-4444-8444-444444444444";
const REQUEST = {
  idempotencyKey: KEY,
  expectedTotal: 22_000,
  delivery: {
    fullName: "Marie Nze",
    phone: "+241077123456",
    cityId: "libreville",
    neighborhood: "Glass",
    landmark: "Face à la pharmacie",
  },
  payment: { method: "airtel", phone: "+241077123456" },
};
const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  jar.set(SESSION_COOKIE, TOKEN);
});

describe("quoteOrder", () => {
  it("revérifie la ville et le code promo avant d'appeler l'API", async () => {
    expect(await quoteOrder(42)).toMatchObject({ ok: false, code: "ADRESSE_INVALIDE" });
    expect(await quoteOrder("libreville", "<script>")).toMatchObject({
      ok: false,
      code: "COUPON_INVALIDE",
    });
    expect(api.quote).not.toHaveBeenCalled();
    api.quote.mockResolvedValue({ ok: true, data: { total: 1 } });
    expect(await quoteOrder("libreville", " bienvenue ")).toEqual({
      ok: true,
      quote: { total: 1 },
    });
    expect(api.quote).toHaveBeenCalledWith(TOKEN, "libreville", "bienvenue");
  });

  it("sans session : rien n'est appelé", async () => {
    jar.clear();
    expect(await quoteOrder("libreville")).toMatchObject({ ok: false, code: "SESSION_INVALIDE" });
    expect(api.quote).not.toHaveBeenCalled();
  });
});

describe("placeOrder", () => {
  it("refuse tout ce qui n'est pas prévu (articles, prix, champs inconnus)", async () => {
    const withItems = { ...REQUEST, items: [{ variantId: KEY, quantity: 1, price: 1 }] };
    expect(await placeOrder(withItems)).toMatchObject({ ok: false });
    expect(await placeOrder({ ...REQUEST, expectedTotal: -1 })).toMatchObject({ ok: false });
    expect(await placeOrder({ ...REQUEST, idempotencyKey: "abc" })).toMatchObject({ ok: false });
    expect(api.create).not.toHaveBeenCalled();
  });

  it("Mobile Money : commande puis demande de paiement ; demande non partie → code transmis à la page", async () => {
    api.create.mockResolvedValue({ ok: true, data: { reference: REF, status: "pending_payment" } });
    api.startPayment.mockResolvedValue({ ok: true, data: {} });
    expect(await placeOrder(REQUEST)).toEqual({ ok: true, reference: REF });
    expect(api.create).toHaveBeenCalledWith(TOKEN, REQUEST);
    expect(api.startPayment).toHaveBeenCalledWith(TOKEN, REF);

    // Même commande renvoyée (même clé) alors que la demande est déjà en attente : pas une erreur
    api.startPayment.mockResolvedValue({ ok: false, code: "PAIEMENT_EN_COURS" });
    expect(await placeOrder(REQUEST)).toEqual({ ok: true, reference: REF });

    api.startPayment.mockResolvedValue({ ok: false, code: "PAIEMENT_INDISPONIBLE" });
    expect(await placeOrder(REQUEST)).toEqual({
      ok: true,
      reference: REF,
      paymentError: "PAIEMENT_INDISPONIBLE",
    });
  });

  it("paiement à la livraison : aucune demande de paiement", async () => {
    api.create.mockResolvedValue({ ok: true, data: { reference: REF, status: "confirmed" } });
    expect(await placeOrder({ ...REQUEST, payment: { method: "cod" } })).toEqual({
      ok: true,
      reference: REF,
    });
    expect(api.startPayment).not.toHaveBeenCalled();
  });

  it("erreur de l'API : code et message en français", async () => {
    api.create.mockResolvedValue({ ok: false, code: "PRIX_MODIFIE" });
    expect(await placeOrder(REQUEST)).toEqual({
      ok: false,
      code: "PRIX_MODIFIE",
      message: expect.stringMatching(/total a changé/),
    });
  });
});

describe("retryPayment et cancelOrder", () => {
  it("numéro de commande revérifié, puis appel avec le jeton du cookie", async () => {
    expect(await retryPayment(null, form({ reference: "../x" }))).toMatchObject({ tone: "error" });
    expect(await cancelOrder(null, form({ reference: "KMD-0000" }))).toMatchObject({
      tone: "error",
    });
    expect(api.startPayment).not.toHaveBeenCalled();
    expect(api.cancel).not.toHaveBeenCalled();

    api.startPayment.mockResolvedValue({ ok: true, data: {} });
    expect(await retryPayment(null, form({ reference: REF }))).toMatchObject({ tone: "success" });
    expect(api.startPayment).toHaveBeenCalledWith(TOKEN, REF, undefined);

    api.cancel.mockResolvedValue({ ok: false, code: "ANNULATION_IMPOSSIBLE" });
    expect(await cancelOrder(null, form({ reference: REF }))).toEqual({
      tone: "error",
      message: expect.stringMatching(/ne peut plus être annulée/),
    });
  });

  it("autre numéro de paiement : forme vérifiée", async () => {
    expect(await retryPayment(null, form({ reference: REF, phone: "077<script>" }))).toMatchObject({
      tone: "error",
    });
    expect(api.startPayment).not.toHaveBeenCalled();
  });
});
