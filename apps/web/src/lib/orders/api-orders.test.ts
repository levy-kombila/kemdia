import { afterEach, describe, expect, it, vi } from "vitest";
import { createOrdersApi, INVOICE_PDF_MAX_BYTES } from "./api-orders";

const KEY = "k".repeat(40);
const TOKEN = "T".repeat(43);
const REF = "KMD-7F3K9Q";
const INVOICE = "KMD-F-2026-000042";
const UUID = "11111111-1111-4111-8111-111111111111";

const QUOTE = {
  subtotal: 20_000,
  discount: 0,
  coupon: null,
  deliveryFee: 2_000,
  total: 22_000,
  freeDeliveryThreshold: 50_000,
  deliveryDaysMin: 1,
  deliveryDaysMax: 2,
  cartOk: true,
  cod: { allowed: true },
  mobileMoney: { allowed: true },
};

const PAYMENT = {
  id: UUID,
  orderReference: REF,
  method: "airtel",
  amount: 22_000,
  phone: "+241077123456",
  status: "pending",
  attempt: 1,
  attemptsLeft: 2,
  failureReason: null,
  createdAt: "2026-10-15T13:00:00.000Z",
  completedAt: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const problem = (status: number, code: string) =>
  json(status, { type: "about:blank", title: "Erreur", status, code });
const pdf = (bytes: Uint8Array<ArrayBuffer>, type = "application/pdf") =>
  new Response(bytes, {
    status: 200,
    headers: { "content-type": type, "content-length": String(bytes.length) },
  });

function api(response: Response | Error) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    response instanceof Response ? Promise.resolve(response) : Promise.reject(response),
  );
  return {
    fetch,
    orders: createOrdersApi({ url: "http://serveur.test:4000", key: KEY, timeoutMs: 1000, fetch }),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("adaptateur API des commandes (S5-T07)", () => {
  it("devis : jeton, clé interne, corps sans prix ; réponse vérifiée par le contrat", async () => {
    const { fetch, orders } = api(json(200, QUOTE));
    expect(await orders.quote(TOKEN, "libreville", "BIENVENUE")).toEqual({ ok: true, data: QUOTE });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://serveur.test:4000/api/v1/orders/quote");
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(headers["x-kemdia-internal-key"]).toBe(KEY);
    expect(JSON.parse(init?.body as string)).toEqual({
      cityId: "libreville",
      couponCode: "BIENVENUE",
    });
  });

  it("erreur métier → son code ; réponse hors contrat ou panne → INDISPONIBLE, sans détail dans les journaux", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await api(problem(409, "PRIX_MODIFIE")).orders.quote(TOKEN, "libreville")).toEqual({
      ok: false,
      code: "PRIX_MODIFIE",
    });
    expect(await api(problem(422, "COUPON_EXPIRE")).orders.quote(TOKEN, "x")).toEqual({
      ok: false,
      code: "COUPON_EXPIRE",
    });
    expect(await api(json(200, { total: "beaucoup" })).orders.get(TOKEN, REF)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    expect(await api(new TypeError("réseau")).orders.get(TOKEN, REF)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    // Les journaux ne disent ni qui ni quelle commande
    const logged = error.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).not.toContain(REF);
    expect(logged).not.toContain(TOKEN);
    expect(logged).toContain("/{commande}");
  });

  it("un jeton mal formé n'est jamais envoyé ; un numéro de commande invalide non plus", async () => {
    const { fetch, orders } = api(json(200, QUOTE));
    expect(await orders.quote("pas un jeton", "libreville")).toEqual({
      ok: false,
      code: "SESSION_INVALIDE",
    });
    expect(() => orders.get(TOKEN, "../admin")).toThrow(TypeError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("paiement : relance avec ou sans autre numéro ; dernier essai", async () => {
    const { fetch, orders } = api(json(201, PAYMENT));
    expect(await orders.startPayment(TOKEN, REF)).toMatchObject({ ok: true });
    expect(fetch.mock.calls[0]![0]).toBe(`http://serveur.test:4000/api/v1/orders/${REF}/payments`);
    expect(JSON.parse(fetch.mock.calls[0]![1]?.body as string)).toEqual({});
    const second = api(json(201, PAYMENT));
    await second.orders.startPayment(TOKEN, REF, "+241077000000");
    expect(JSON.parse(second.fetch.mock.calls[0]![1]?.body as string)).toEqual({
      phone: "+241077000000",
    });
  });

  it("liste : curseur transmis s'il a la bonne forme, ignoré sinon", async () => {
    const page = { items: [], nextCursor: null };
    const ok = api(json(200, page));
    await ok.orders.list(TOKEN, "a".repeat(30));
    expect(ok.fetch.mock.calls[0]![0]).toBe(
      `http://serveur.test:4000/api/v1/orders?before=${"a".repeat(30)}`,
    );
    const bad = api(json(200, page));
    await bad.orders.list(TOKEN, "a&b=c");
    expect(bad.fetch.mock.calls[0]![0]).toBe("http://serveur.test:4000/api/v1/orders");
  });

  it("PDF : seulement un vrai PDF, de taille raisonnable", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const real = new TextEncoder().encode("%PDF-1.7\n…");
    const ok = api(pdf(real));
    const result = await ok.orders.invoicePdf(TOKEN, REF, INVOICE);
    expect(result.ok && Array.from(result.data)).toEqual(Array.from(real));
    expect(ok.fetch.mock.calls[0]![0]).toBe(
      `http://serveur.test:4000/api/v1/orders/${REF}/invoices/${INVOICE}`,
    );
    expect((ok.fetch.mock.calls[0]![1]?.headers as Record<string, string>).accept).toBe(
      "application/pdf",
    );
    // Contenu qui n'est pas un PDF, ou annoncé trop gros
    expect(
      await api(pdf(new TextEncoder().encode("<html>"))).orders.invoicePdf(TOKEN, REF, INVOICE),
    ).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    const huge = new Response(real, {
      headers: {
        "content-type": "application/pdf",
        "content-length": String(INVOICE_PDF_MAX_BYTES + 1),
      },
    });
    expect(await api(huge).orders.invoicePdf(TOKEN, REF, INVOICE)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    expect(
      await api(problem(404, "FACTURE_INTROUVABLE")).orders.invoicePdf(TOKEN, REF, INVOICE),
    ).toEqual({
      ok: false,
      code: "FACTURE_INTROUVABLE",
    });
    // Numéro mal formé : aucun appel
    const none = api(pdf(real));
    expect(await none.orders.invoicePdf(TOKEN, REF, "KMD-F-26-1")).toEqual({
      ok: false,
      code: "FACTURE_INTROUVABLE",
    });
    expect(none.fetch).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
