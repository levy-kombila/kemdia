import { afterEach, describe, expect, it, vi } from "vitest";
import { createStaffApi } from "./api-staff";

const KEY = "k".repeat(40);
const TOKEN = "T".repeat(43);
const SHOP = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const IMAGE = "33333333-3333-4333-8333-333333333333";
const NOW = "2026-10-16T18:00:00.000Z";

const ADMIN_SHOP = {
  id: SHOP,
  kind: "partner",
  name: "Atelier Nzé",
  slug: "atelier-nze",
  city: "Libreville",
  description: "Pagnes et tissus wax de qualité.",
  status: "pending",
  statusReason: null,
  submittedAt: NOW,
  reviewedAt: null,
  phone: "+241066123456",
  ownerAccountId: "44444444-4444-4444-8444-444444444444",
  reviewedBy: null,
  createdAt: NOW,
};
const PRODUCT_VIEW = {
  id: PRODUCT,
  slug: "sac-raphia",
  title: "Sac en raphia",
  description: "Un sac tressé à la main.",
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
  variants: [],
  shop: { id: SHOP, name: "Atelier Nzé", status: "active" },
  reviewedBy: null,
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
const problem = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { type: "about:blank", title: "Erreur", status, code }, headers);
const webp = (size = 64) => {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  return bytes;
};

function api(response: Response | Error, visitorIp?: () => Promise<string | null>) {
  const fetch = vi.fn<typeof globalThis.fetch>(() =>
    response instanceof Response ? Promise.resolve(response) : Promise.reject(response),
  );
  return {
    fetch,
    staff: createStaffApi({
      url: "http://serveur.test:4000",
      key: KEY,
      timeoutMs: 1000,
      fetch,
      visitorIp,
    }),
  };
}

const sent = (fetch: ReturnType<typeof api>["fetch"]) => {
  const [url, init] = fetch.mock.calls[0]!;
  return {
    url: String(url),
    method: init?.method ?? "GET",
    headers: init?.headers as Record<string, string>,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  };
};

afterEach(() => vi.restoreAllMocks());

describe("adaptateur de l'espace de l'équipe (S6-T05)", () => {
  it("présente le jeton de session, la clé interne et l'adresse du visiteur ; jamais de cache", async () => {
    const { fetch, staff } = api(
      json(200, { enabled: true, required: true, verifiedUntil: null, recoveryCodesLeft: 10 }),
      () => Promise.resolve("41.158.0.1"),
    );
    const result = await staff.secondFactor(TOKEN);
    expect(result).toEqual({
      ok: true,
      data: { enabled: true, required: true, verifiedUntil: null, recoveryCodesLeft: 10 },
    });
    const request = sent(fetch);
    expect(request.url).toBe("http://serveur.test:4000/api/v1/auth/2fa");
    expect(request.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(request.headers["x-kemdia-internal-key"]).toBe(KEY);
    expect(request.headers["x-kemdia-client-ip"]).toBe("41.158.0.1");
    expect(fetch.mock.calls[0]![1]).toMatchObject({ cache: "no-store", redirect: "error" });
  });

  it("un jeton mal formé n'est jamais envoyé", async () => {
    const { fetch, staff } = api(json(200, {}));
    expect(await staff.secondFactor("pas-un-jeton")).toEqual({
      ok: false,
      code: "SESSION_INVALIDE",
    });
    expect(await staff.moderationImage("pas-un-jeton", PRODUCT, IMAGE)).toEqual({ status: 403 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("codes métier de l'API transmis (avec l'attente) ; tout le reste → INDISPONIBLE", async () => {
    const locked = api(problem(429, "TROP_D_ESSAIS", { "retry-after": "900" }));
    expect(await locked.staff.verifySecondFactor(TOKEN, "123456")).toEqual({
      ok: false,
      code: "TROP_D_ESSAIS",
      retryAfterSeconds: 900,
    });
    const required = api(problem(403, "DEUX_FACTEURS_REQUIS"));
    expect(await required.staff.shops(TOKEN, {})).toEqual({
      ok: false,
      code: "DEUX_FACTEURS_REQUIS",
    });
    const changed = api(problem(409, "PRODUIT_MODIFIE"));
    expect(await changed.staff.decideProduct(TOKEN, PRODUCT, "approve", NOW)).toEqual({
      ok: false,
      code: "PRODUIT_MODIFIE",
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await api(problem(500, "PANNE_INCONNUE")).staff.shops(TOKEN, {})).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    expect(await api(new TypeError("fetch failed")).staff.shops(TOKEN, {})).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    expect(error).toHaveBeenCalledWith("[équipe] GET /admin/shops : API injoignable");
  });

  it("réponse non conforme au contrat → INDISPONIBLE, journal sans aucune valeur reçue", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { staff } = api(json(200, { secret: "SECRETSECRET", otpauthUri: "http://piege" }));
    expect(await staff.setupSecondFactor(TOKEN, "mot de passe")).toEqual({
      ok: false,
      code: "INDISPONIBLE",
    });
    const logged = error.mock.calls.flat().join(" ");
    expect(logged).toContain("réponse non conforme");
    expect(logged).not.toContain("SECRETSECRET");
    expect(logged).not.toContain("piege");
  });

  it("le mot de passe et les codes vont dans le corps, jamais dans l'adresse ni le journal", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetch, staff } = api(problem(500, "X"));
    await staff.setupSecondFactor(TOKEN, "Mon-Mot-De-Passe-1");
    const request = sent(fetch);
    expect(request.method).toBe("POST");
    expect(request.url).toBe("http://serveur.test:4000/api/v1/auth/2fa/setup");
    expect(request.body).toEqual({ password: "Mon-Mot-De-Passe-1" });
    expect(error.mock.calls.flat().join(" ")).not.toContain("Mon-Mot-De-Passe-1");
  });

  it("listes : filtres passés dans l'adresse ; boutique lue telle que le contrat la décrit", async () => {
    const { fetch, staff } = api(json(200, { items: [ADMIN_SHOP], nextCursor: null }));
    const result = await staff.shops(TOKEN, {
      status: "pending",
      after: "a".repeat(24),
      limit: 20,
    });
    expect(result).toMatchObject({ ok: true, data: { items: [{ id: SHOP }] } });
    expect(sent(fetch).url).toBe(
      `http://serveur.test:4000/api/v1/admin/shops?status=pending&after=${"a".repeat(24)}&limit=20`,
    );
    const queue = api(json(200, { items: [PRODUCT_VIEW], nextCursor: null }));
    await queue.staff.moderationQueue(TOKEN, { status: "rejected" });
    expect(sent(queue.fetch).url).toBe(
      "http://serveur.test:4000/api/v1/moderation/products?status=rejected",
    );
  });

  it("décisions sur une boutique : valider sans corps, refuser et suspendre avec le motif", async () => {
    const approve = api(json(200, { ...ADMIN_SHOP, status: "active" }));
    await approve.staff.decideShop(TOKEN, SHOP, "approve");
    expect(sent(approve.fetch)).toMatchObject({
      method: "POST",
      url: `http://serveur.test:4000/api/v1/admin/shops/${SHOP}/approve`,
      body: undefined,
    });
    const reject = api(json(200, { ...ADMIN_SHOP, status: "rejected", statusReason: "Motif" }));
    await reject.staff.decideShop(TOKEN, SHOP.toUpperCase(), "reject", "Pièces manquantes");
    expect(sent(reject.fetch)).toMatchObject({
      url: `http://serveur.test:4000/api/v1/admin/shops/${SHOP}/reject`,
      body: { reason: "Pièces manquantes" },
    });
  });

  it("décisions sur un produit : la version lue (`submittedAt`) part toujours avec la décision", async () => {
    const reject = api(
      json(200, { ...PRODUCT_VIEW, status: "rejected", moderationReason: "Motif" }),
    );
    await reject.staff.decideProduct(TOKEN, PRODUCT, "reject", NOW, "Photo floue");
    expect(sent(reject.fetch)).toMatchObject({
      url: `http://serveur.test:4000/api/v1/moderation/products/${PRODUCT}/reject`,
      body: { submittedAt: NOW, reason: "Photo floue" },
    });
  });

  it("identifiant qui n'est pas un UUID : rien n'est demandé (pas de chemin fabriqué)", async () => {
    const { fetch, staff } = api(json(200, {}));
    expect(await staff.shop(TOKEN, "../../auth/2fa")).toEqual({
      ok: false,
      code: "BOUTIQUE_INTROUVABLE",
    });
    expect(await staff.decideShop(TOKEN, "x", "approve")).toEqual({
      ok: false,
      code: "BOUTIQUE_INTROUVABLE",
    });
    expect(await staff.moderationProduct(TOKEN, "1 OR 1=1")).toEqual({
      ok: false,
      code: "PRODUIT_INTROUVABLE",
    });
    expect(await staff.decideProduct(TOKEN, "x", "approve", NOW)).toEqual({
      ok: false,
      code: "PRODUIT_INTROUVABLE",
    });
    expect(await staff.moderationImage(TOKEN, PRODUCT, "photo.svg")).toEqual({ status: 404 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("le journal ne contient jamais d'identifiant", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await api(problem(500, "X")).staff.decideProduct(TOKEN, PRODUCT, "approve", NOW);
    expect(error).toHaveBeenCalledWith(
      "[équipe] POST /moderation/products/{id}/approve : statut 500",
    );
  });
});

describe("photo à modérer (relais de l'équipe)", () => {
  const image = (body: BodyInit | null, status = 200, type = "image/webp") =>
    new Response(body, { status, headers: { "content-type": type } });

  it("relaie un WebP vérifié, demandé avec le jeton de session", async () => {
    const { fetch, staff } = api(image(webp()));
    const result = await staff.moderationImage(TOKEN, PRODUCT, IMAGE);
    expect(result.status).toBe(200);
    expect(sent(fetch).url).toBe(
      `http://serveur.test:4000/api/v1/moderation/products/${PRODUCT}/images/${IMAGE}`,
    );
    expect(sent(fetch).headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("refus de l'API → 403 ; photo inconnue → 404", async () => {
    expect(
      await api(problem(403, "DEUX_FACTEURS_REQUIS")).staff.moderationImage(TOKEN, PRODUCT, IMAGE),
    ).toEqual({ status: 403 });
    expect(
      await api(problem(401, "SESSION_INVALIDE")).staff.moderationImage(TOKEN, PRODUCT, IMAGE),
    ).toEqual({ status: 403 });
    expect(
      await api(problem(404, "PHOTO_INTROUVABLE")).staff.moderationImage(TOKEN, PRODUCT, IMAGE),
    ).toEqual({ status: 404 });
  });

  it("autre chose qu'un WebP de 2 Mo au plus : jamais relayé (503)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(
      await api(image(html, 200, "text/html")).staff.moderationImage(TOKEN, PRODUCT, IMAGE),
    ).toEqual({ status: 503 });
    // Annoncé comme WebP mais ce n'en est pas un
    expect(await api(image(html)).staff.moderationImage(TOKEN, PRODUCT, IMAGE)).toEqual({
      status: 503,
    });
    expect(
      await api(image(webp(2 * 1024 * 1024 + 1))).staff.moderationImage(TOKEN, PRODUCT, IMAGE),
    ).toEqual({ status: 503 });
    expect(
      await api(new TypeError("fetch failed")).staff.moderationImage(TOKEN, PRODUCT, IMAGE),
    ).toEqual({ status: 503 });
  });
});
