import { afterEach, describe, expect, it, vi } from "vitest";
import { createVendorApi } from "./api-vendor";

const KEY = "k".repeat(40);
const TOKEN = "T".repeat(43);
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const VARIANT = "44444444-4444-4444-8444-444444444444";
const IMAGE = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-10-16T18:00:00.000Z";

const PRODUCT_VIEW = {
  id: PRODUCT,
  slug: "chemise-pagne",
  listing: { id: PRODUCT, slug: "chemise-pagne", status: "pending", editable: true },
  title: "Chemise en pagne",
  description: "Chemise homme en pagne wax.",
  brand: null,
  categoryId: "55555555-5555-4555-8555-555555555555",
  images: [`/images/v/${IMAGE}.webp`],
  status: "pending",
  moderationReason: null,
  visible: false,
  submittedAt: NOW,
  reviewedAt: null,
  createdAt: NOW,
  updatedAt: NOW,
  variants: [
    {
      id: VARIANT,
      listingVariantId: VARIANT,
      sku: "V1-1",
      name: "M",
      attributes: {},
      price: 15000,
      compareAtPrice: null,
      stock: 4,
      isActive: true,
    },
  ],
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const problem = (status: number, code: string, detail?: string) =>
  json(status, {
    type: "about:blank",
    title: "Erreur",
    status,
    code,
    ...(detail ? { detail } : {}),
  });

function api(response: Response | Error) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    response instanceof Response ? Promise.resolve(response) : Promise.reject(response),
  );
  return {
    fetch,
    vendor: createVendorApi({ url: "http://serveur.test:4000", key: KEY, timeoutMs: 1000, fetch }),
  };
}
const sent = (fetch: ReturnType<typeof api>["fetch"]) => {
  const [url, init] = fetch.mock.calls[0]!;
  return {
    url: String(url),
    method: init?.method ?? "GET",
    headers: init?.headers as Record<string, string>,
    body: init?.body,
  };
};

afterEach(() => vi.restoreAllMocks());

describe("adaptateur de l'espace vendeur (S6-T06)", () => {
  it("présente le jeton et la clé interne ; jamais de cache ni de redirection suivie", async () => {
    const { fetch, vendor } = api(json(200, PRODUCT_VIEW));
    expect(await vendor.product(TOKEN, PRODUCT.toUpperCase())).toMatchObject({
      ok: true,
      data: { id: PRODUCT },
    });
    const request = sent(fetch);
    expect(request.url).toBe(`http://serveur.test:4000/api/v1/vendors/products/${PRODUCT}`);
    expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(request.headers["x-kemdia-internal-key"]).toBe(KEY);
    expect(fetch.mock.calls[0]![1]).toMatchObject({ cache: "no-store", redirect: "error" });
  });

  it("identifiants vérifiés avant d'entrer dans une adresse ; jeton mal formé jamais envoyé", async () => {
    const { fetch, vendor } = api(json(200, PRODUCT_VIEW));
    for (const result of await Promise.all([
      vendor.product(TOKEN, "../../admin/shops"),
      vendor.updateVariant(TOKEN, PRODUCT, "x", { price: 1 }),
      vendor.removeImage(TOKEN, PRODUCT, "../photo"),
      vendor.archive(TOKEN, "1 OR 1=1"),
    ]))
      expect(result).toEqual({ ok: false, code: "PRODUIT_INTROUVABLE" });
    expect(await vendor.image(TOKEN, PRODUCT, "x.svg")).toEqual({ status: 404 });
    expect(await vendor.shop("pas-un-jeton")).toEqual({ ok: false, code: "SESSION_INVALIDE" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("champ mal rempli : code et explication de l'API ; autres codes sans explication", async () => {
    expect(
      await api(
        problem(422, "PRODUIT_INVALIDE", "le titre : 5 à 120 caractères"),
      ).vendor.createProduct(TOKEN, {
        title: "x",
        description: "y",
        categoryId: PRODUCT,
        variants: [],
      }),
    ).toEqual({ ok: false, code: "PRODUIT_INVALIDE", detail: "le titre : 5 à 120 caractères" });
    expect(
      await api(problem(409, "STOCK_MODIFIE", "secret interne")).vendor.archive(TOKEN, PRODUCT),
    ).toEqual({
      ok: false,
      code: "STOCK_MODIFIE",
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await api(problem(500, "INCONNU")).vendor.shop(TOKEN)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
  });

  it("photo : envoyée telle quelle avec son type, délai plus long ; ordre et retrait", async () => {
    const add = api(json(201, PRODUCT_VIEW));
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    await add.vendor.addImage(TOKEN, PRODUCT, bytes, "image/jpeg");
    const request = sent(add.fetch);
    expect(request).toMatchObject({
      method: "POST",
      url: `http://serveur.test:4000/api/v1/vendors/products/${PRODUCT}/images`,
    });
    expect(request.headers["content-type"]).toBe("image/jpeg");
    expect(request.body).toBe(bytes);

    const order = api(json(200, PRODUCT_VIEW));
    await order.vendor.reorderImages(TOKEN, PRODUCT, [IMAGE]);
    expect(sent(order.fetch)).toMatchObject({
      method: "PUT",
      body: JSON.stringify({ images: [IMAGE] }),
    });

    const remove = api(json(200, PRODUCT_VIEW));
    await remove.vendor.removeImage(TOKEN, PRODUCT, IMAGE);
    expect(sent(remove.fetch)).toMatchObject({
      method: "DELETE",
      url: `http://serveur.test:4000/api/v1/vendors/products/${PRODUCT}/images/${IMAGE}`,
    });
  });

  it("variante : PATCH avec le stock lu", async () => {
    const { fetch, vendor } = api(json(200, PRODUCT_VIEW));
    await vendor.updateVariant(TOKEN, PRODUCT, VARIANT, {
      price: 14500,
      stock: 9,
      previousStock: 4,
    });
    expect(sent(fetch)).toMatchObject({
      method: "PATCH",
      url: `http://serveur.test:4000/api/v1/vendors/products/${PRODUCT}/variants/${VARIANT}`,
      body: JSON.stringify({ price: 14500, stock: 9, previousStock: 4 }),
    });
  });

  it("le journal ne contient jamais d'identifiant", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await api(problem(500, "X")).vendor.restore(TOKEN, PRODUCT);
    expect(error).toHaveBeenCalledWith(
      "[vendeur] POST /vendors/products/{id}/restore : statut 500",
    );
  });

  it("aperçu : seulement un WebP vérifié ; refus et absence → 404", async () => {
    const webp = new Uint8Array(32);
    webp.set(new TextEncoder().encode("RIFF"), 0);
    webp.set(new TextEncoder().encode("WEBP"), 8);
    const ok = api(new Response(webp, { status: 200, headers: { "content-type": "image/webp" } }));
    expect((await ok.vendor.image(TOKEN, PRODUCT, IMAGE)).status).toBe(200);
    expect(await api(problem(403, "ACCES_REFUSE")).vendor.image(TOKEN, PRODUCT, IMAGE)).toEqual({
      status: 404,
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const html = new TextEncoder().encode("<html></html>");
    expect(
      await api(
        new Response(html, { status: 200, headers: { "content-type": "image/webp" } }),
      ).vendor.image(TOKEN, PRODUCT, IMAGE),
    ).toEqual({ status: 503 });
  });
});

describe("commandes de la boutique (S6-T07)", () => {
  const REF = "KMD-ABC234";
  const VIEW = {
    reference: REF,
    status: "pending",
    orderStatus: "confirmed",
    itemCount: 2,
    subtotal: 30000,
    cityName: "Libreville",
    receivedAt: NOW,
    dueAt: NOW,
    decidedAt: null,
    lines: [
      {
        variantId: VARIANT,
        productId: PRODUCT,
        title: "Chemise en pagne",
        variantName: "M",
        unitPrice: 15000,
        quantity: 2,
        lineTotal: 30000,
      },
    ],
    refusalReason: null,
    canDecide: true,
  };

  it("référence vérifiée avant toute adresse : rien n'est appelé sinon", async () => {
    const { fetch, vendor } = api(json(200, VIEW));
    for (const bad of ["kmd-abc234", "KMD-ABC23", "../x", "KMD-ABC234/../../admin"]) {
      expect(await vendor.order(TOKEN, bad)).toEqual({ ok: false, code: "COMMANDE_INTROUVABLE" });
      expect(await vendor.refuseOrder(TOKEN, bad, "motif")).toMatchObject({ ok: false });
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fiche, acceptation et refus : bonnes adresses, réponse vérifiée par le contrat", async () => {
    const { fetch, vendor } = api(json(200, VIEW));
    expect(await vendor.order(TOKEN, REF)).toMatchObject({ ok: true, data: { reference: REF } });
    await vendor.acceptOrder(TOKEN, REF);
    await vendor.refuseOrder(TOKEN, REF, "Rupture de stock");
    const calls = fetch.mock.calls.map(([url, init]) => [String(url), init?.method, init?.body]);
    expect(calls).toEqual([
      [`http://serveur.test:4000/api/v1/vendors/orders/${REF}`, "GET", undefined],
      [`http://serveur.test:4000/api/v1/vendors/orders/${REF}/accept`, "POST", undefined],
      [
        `http://serveur.test:4000/api/v1/vendors/orders/${REF}/refuse`,
        "POST",
        JSON.stringify({ reason: "Rupture de stock" }),
      ],
    ]);
  });

  it("codes de commande reconnus ; réponse non conforme → INDISPONIBLE", async () => {
    expect(await api(problem(409, "DECISION_IMPOSSIBLE")).vendor.acceptOrder(TOKEN, REF)).toEqual({
      ok: false,
      code: "DECISION_IMPOSSIBLE",
    });
    expect(await api(json(200, { ...VIEW, cityName: 3 })).vendor.order(TOKEN, REF)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
  });

  it("liste : filtre et curseur transmis", async () => {
    const { fetch, vendor } = api(json(200, { items: [], nextCursor: null }));
    await vendor.orders(TOKEN, { status: "pending", before: "c".repeat(24), limit: 20 });
    expect(String(fetch.mock.calls[0]![0])).toBe(
      `http://serveur.test:4000/api/v1/vendors/orders?status=pending&before=${"c".repeat(24)}&limit=20`,
    );
  });
});
