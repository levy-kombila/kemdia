import { afterEach, describe, expect, it, vi } from "vitest";
import { createCartApi } from "./api-cart";

const KEY = "k".repeat(40);
const TOKEN = "T".repeat(43);
const VARIANT = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const MERGE_ID = "44444444-4444-4444-8444-444444444444";
const CART = {
  lines: [
    {
      variantId: VARIANT,
      productId: PRODUCT,
      slug: "telephone",
      title: "Téléphone",
      variantName: "",
      image: "/images/products/telephone.webp",
      price: 95_000,
      compareAtPrice: null,
      quantity: 2,
      maxQuantity: 20,
      ok: true,
    },
  ],
  itemCount: 2,
  subtotal: 190_000,
  ok: true,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const problem = (status: number, code: string) =>
  json(status, { type: "about:blank", title: "Erreur", status, code });

function api(response: Response | Error, visitorIp?: () => Promise<string | null>) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    response instanceof Response ? Promise.resolve(response) : Promise.reject(response),
  );
  return {
    fetch,
    cart: createCartApi({
      url: "http://serveur.test:4000",
      key: KEY,
      timeoutMs: 1000,
      fetch,
      visitorIp,
    }),
  };
}

afterEach(() => vi.restoreAllMocks());

describe("adaptateur API du panier (S5-T01)", () => {
  it("ajout : jeton de session, clé interne, adresse du visiteur ; corps sans prix ; réponse vérifiée", async () => {
    const { fetch, cart } = api(json(200, CART), () => Promise.resolve("203.0.113.5"));
    expect(await cart.add(TOKEN, VARIANT, 2)).toEqual({ ok: true, data: CART });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://serveur.test:4000/api/v1/cart/items");
    expect(init?.method).toBe("POST");
    expect(init?.cache).toBe("no-store");
    expect(init?.headers).toMatchObject({
      authorization: `Bearer ${TOKEN}`,
      "x-kemdia-internal-key": KEY,
      "x-kemdia-client-ip": "203.0.113.5",
    });
    expect(JSON.parse(init?.body as string)).toEqual({ variantId: VARIANT, quantity: 2 });
  });

  it("routes : lecture, quantité, retrait, vidage, réunion", async () => {
    const calls: [string, string][] = [];
    const fetch = vi.fn<typeof globalThis.fetch>((url, init) => {
      calls.push([String(init?.method), String(url)]);
      return Promise.resolve(
        json(200, String(url).endsWith("/merge") ? { ...CART, ignored: 1 } : CART),
      );
    });
    const cart = createCartApi({
      url: "http://serveur.test:4000",
      key: KEY,
      timeoutMs: 1000,
      fetch,
    });
    await cart.get(TOKEN);
    await cart.setQuantity(TOKEN, VARIANT, 3);
    await cart.remove(TOKEN, VARIANT);
    await cart.clear(TOKEN);
    const merged = await cart.merge(TOKEN, MERGE_ID, [{ variantId: VARIANT, quantity: 1 }]);
    expect(merged).toEqual({ ok: true, data: { ...CART, ignored: 1 } });
    expect(calls).toEqual([
      ["GET", "http://serveur.test:4000/api/v1/cart"],
      ["PUT", `http://serveur.test:4000/api/v1/cart/items/${VARIANT}`],
      ["DELETE", `http://serveur.test:4000/api/v1/cart/items/${VARIANT}`],
      ["DELETE", "http://serveur.test:4000/api/v1/cart"],
      ["POST", "http://serveur.test:4000/api/v1/cart/merge"],
    ]);
    const body = JSON.parse(fetch.mock.calls[4]![1]!.body as string) as unknown;
    expect(body).toEqual({ mergeId: MERGE_ID, lines: [{ variantId: VARIANT, quantity: 1 }] });
  });

  it("jeton mal formé : rien n'est envoyé", async () => {
    const { fetch, cart } = api(json(200, CART));
    expect(await cart.get("pas-un-jeton")).toEqual({ ok: false, code: "SESSION_INVALIDE" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("erreurs métier → leur code ; autre chose → INDISPONIBLE", async () => {
    for (const code of [
      "PANIER_PLEIN",
      "PRODUIT_INDISPONIBLE",
      "VARIANTE_INCONNUE",
      "SESSION_INVALIDE",
      "TROP_DE_REQUETES",
    ]) {
      expect(await api(problem(409, code)).cart.add(TOKEN, VARIANT, 1)).toEqual({
        ok: false,
        code,
      });
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await api(problem(403, "ACCES_REFUSE")).cart.get(TOKEN)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    expect(await api(new Response("panne", { status: 502 })).cart.get(TOKEN)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    expect(await api(new TypeError("fetch failed")).cart.get(TOKEN)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
  });

  it("réponse non conforme au contrat (ex. prix non entier) : INDISPONIBLE, sans valeur ni variante au journal", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const bad = { ...CART, lines: [{ ...CART.lines[0], price: 10.5 }] };
    expect(await api(json(200, bad)).cart.setQuantity(TOKEN, VARIANT, 1)).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    const logged = log.mock.calls.flat().join(" ");
    expect(logged).toContain("/items/{variante}");
    expect(logged).not.toContain(VARIANT);
    expect(logged).not.toContain("10.5");
    expect(logged).not.toContain(TOKEN);
  });
});
