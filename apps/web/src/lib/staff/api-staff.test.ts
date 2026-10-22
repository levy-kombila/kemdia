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

describe("fiches communes et propositions (S7.5-T03)", () => {
  const LISTING = "77777777-7777-4777-8777-777777777777";
  const CORRECTION = "88888888-8888-4888-8888-888888888888";
  const CORRECTION_VIEW = {
    id: CORRECTION,
    listing: { id: LISTING, slug: "sac-raphia", title: "Sac en raphia" },
    shop: { id: SHOP, name: "Atelier Nzé" },
    message: "La couleur est beige, pas marron.",
    createdAt: NOW,
    closedAt: NOW,
    note: "Corrigé",
  };

  it("propositions : filtres dans l'adresse, réponse vérifiée par le contrat", async () => {
    const { fetch, staff } = api(json(200, { items: [CORRECTION_VIEW], nextCursor: null }));
    const result = await staff.corrections(TOKEN, { status: "open", listingId: LISTING });
    expect(result).toMatchObject({ ok: true, data: { items: [{ id: CORRECTION }] } });
    expect(sent(fetch).url).toBe(
      `http://serveur.test:4000/api/v1/moderation/listing-corrections?status=open&listingId=${LISTING}`,
    );
    // Identifiant de fiche fabriqué : jamais mis dans l'adresse
    const other = api(json(200, { items: [], nextCursor: null }));
    await other.staff.corrections(TOKEN, { listingId: "x&status=closed" });
    expect(sent(other.fetch).url).toBe(
      "http://serveur.test:4000/api/v1/moderation/listing-corrections",
    );
  });

  it("clôture : réponse dans le corps ; sans réponse, corps vide", async () => {
    const { fetch, staff } = api(json(200, CORRECTION_VIEW));
    expect(await staff.closeCorrection(TOKEN, CORRECTION, "Corrigé")).toMatchObject({ ok: true });
    expect(sent(fetch)).toMatchObject({ method: "POST", body: { note: "Corrigé" } });
    const empty = api(json(200, CORRECTION_VIEW));
    await empty.staff.closeCorrection(TOKEN, CORRECTION);
    expect(sent(empty.fetch).body).toEqual({});
  });

  it("identifiants qui ne sont pas des UUID : rien n'est demandé", async () => {
    const { fetch, staff } = api(json(200, {}));
    expect(await staff.listing(TOKEN, "../x")).toEqual({ ok: false, code: "FICHE_INTROUVABLE" });
    expect(await staff.mergeListing(TOKEN, LISTING, "x", {})).toEqual({
      ok: false,
      code: "FICHE_INTROUVABLE",
    });
    expect(await staff.withdrawOffer(TOKEN, "x", "Motif")).toEqual({
      ok: false,
      code: "PRODUIT_INTROUVABLE",
    });
    expect(await staff.closeCorrection(TOKEN, "x")).toEqual({
      ok: false,
      code: "CORRECTION_INTROUVABLE",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("équipe et service client (S7.5-T04)", () => {
  const ACCOUNT = "99999999-9999-4999-8999-999999999999";
  const ADMIN_ACCOUNT = {
    id: ACCOUNT,
    firstName: "Awa",
    lastName: "Ndong",
    email: "awa@exemple.ga",
    phone: null,
    roles: ["client", "support"],
    status: "active",
    createdAt: NOW,
  };

  it("liste de l'équipe : filtre de rôle et position dans l'adresse ; position fabriquée ignorée", async () => {
    const { fetch, staff } = api(
      json(200, {
        items: [{ ...ADMIN_ACCOUNT, secondFactorEnabled: true, lastActiveAt: NOW }],
        nextCursor: null,
      }),
    );
    const result = await staff.staff(TOKEN, { role: "support", after: "a".repeat(30), limit: 50 });
    expect(result).toMatchObject({ ok: true, data: { items: [{ id: ACCOUNT }] } });
    expect(sent(fetch).url).toBe(
      `http://serveur.test:4000/api/v1/admin/staff?role=support&after=${"a".repeat(30)}&limit=50`,
    );
    const other = api(json(200, { items: [], nextCursor: null }));
    await other.staff.staff(TOKEN, { after: "x&role=admin" });
    expect(sent(other.fetch).url).toBe("http://serveur.test:4000/api/v1/admin/staff");
  });

  it("recherches : identifiant dans le CORPS, jamais dans l'adresse", async () => {
    const { fetch, staff } = api(json(200, ADMIN_ACCOUNT));
    expect(await staff.lookupAccount(TOKEN, "awa@exemple.ga")).toMatchObject({ ok: true });
    expect(sent(fetch)).toMatchObject({
      url: "http://serveur.test:4000/api/v1/admin/accounts/lookup",
      method: "POST",
      body: { identifier: "awa@exemple.ga" },
    });
    const support = api(
      json(200, { ...ADMIN_ACCOUNT, lastActiveAt: NOW, emailVerified: true, phoneVerified: false }),
    );
    expect(await support.staff.supportLookup(TOKEN, "awa@exemple.ga")).toMatchObject({ ok: true });
    expect(sent(support.fetch)).toMatchObject({
      url: "http://serveur.test:4000/api/v1/support/accounts/lookup",
      body: { identifier: "awa@exemple.ga" },
    });
  });

  it("rôles et actions : bonne méthode, motif seulement pour la désactivation", async () => {
    const grant = api(json(200, ADMIN_ACCOUNT));
    await grant.staff.setRole(TOKEN, ACCOUNT.toUpperCase(), "logistics", true);
    expect(sent(grant.fetch)).toMatchObject({
      method: "PUT",
      url: `http://serveur.test:4000/api/v1/admin/accounts/${ACCOUNT}/roles/logistics`,
    });
    const revoke = api(json(200, ADMIN_ACCOUNT));
    await revoke.staff.setRole(TOKEN, ACCOUNT, "finance", false);
    expect(sent(revoke.fetch).method).toBe("DELETE");

    const done = { account: ADMIN_ACCOUNT, sessionsClosed: 2 };
    const disable = api(json(200, done));
    expect(await disable.staff.staffAction(TOKEN, ACCOUNT, "disable", "Fin de contrat")).toEqual({
      ok: true,
      data: done,
    });
    expect(sent(disable.fetch)).toMatchObject({
      url: `http://serveur.test:4000/api/v1/admin/accounts/${ACCOUNT}/disable`,
      body: { reason: "Fin de contrat" },
    });
    const remove = api(json(200, done));
    await remove.staff.staffAction(TOKEN, ACCOUNT, "remove-staff");
    expect(sent(remove.fetch).body).toEqual({});
    const refused = api(problem(403, "COMPTE_PROTEGE"));
    expect(await refused.staff.staffAction(TOKEN, ACCOUNT, "enable")).toEqual({
      ok: false,
      code: "COMPTE_PROTEGE",
    });
  });

  it("commandes du service client ; identifiants fabriqués : rien n'est demandé", async () => {
    const page = api(json(200, { items: [], nextCursor: null }));
    await page.staff.supportOrders(TOKEN, ACCOUNT, "b".repeat(30));
    expect(sent(page.fetch).url).toBe(
      `http://serveur.test:4000/api/v1/support/accounts/${ACCOUNT}/orders?before=${"b".repeat(30)}`,
    );
    const { fetch, staff } = api(json(200, {}));
    expect(await staff.setRole(TOKEN, "../x", "catalog", true)).toEqual({
      ok: false,
      code: "COMPTE_INTROUVABLE",
    });
    expect(await staff.staffAction(TOKEN, "x", "disable", "Motif")).toMatchObject({ ok: false });
    expect(await staff.supportOrders(TOKEN, "x")).toMatchObject({ ok: false });
    expect(await staff.supportOrder(TOKEN, ACCOUNT, "../../admin")).toEqual({
      ok: false,
      code: "COMMANDE_INTROUVABLE",
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("Finance et journal (S7.5-T05)", () => {
  const NUMBER = "KMD-F-2026-000012";
  const INVOICE = {
    number: NUMBER,
    kind: "invoice",
    orderReference: "KMD-7F3K9Q",
    issuedAt: NOW,
    total: 15_000,
    buyerName: "Marie Nze",
    paymentMethod: "cod",
    email: "sent",
    emailSentAt: NOW,
  };

  it("factures : recherche et position dans l'adresse ; position fabriquée ignorée ; renvoi par numéro vérifié", async () => {
    const { fetch, staff } = api(json(200, { items: [INVOICE], nextCursor: null }));
    expect(await staff.invoices(TOKEN, { q: "KMD-7F3K9Q", after: "c".repeat(30) })).toMatchObject({
      ok: true,
    });
    expect(sent(fetch).url).toBe(
      `http://serveur.test:4000/api/v1/admin/invoices?q=KMD-7F3K9Q&after=${"c".repeat(30)}`,
    );
    const other = api(json(200, { items: [], nextCursor: null }));
    await other.staff.invoices(TOKEN, { after: "x&q=1" });
    expect(sent(other.fetch).url).toBe("http://serveur.test:4000/api/v1/admin/invoices");
    const resend = api(json(200, INVOICE));
    await resend.staff.resendInvoice(TOKEN, NUMBER);
    expect(sent(resend.fetch)).toMatchObject({
      method: "POST",
      url: `http://serveur.test:4000/api/v1/admin/invoices/${NUMBER}/resend`,
    });
    const none = api(json(200, {}));
    expect(await none.staff.resendInvoice(TOKEN, "../admin")).toEqual({
      ok: false,
      code: "FACTURE_INTROUVABLE",
    });
    expect(none.fetch).not.toHaveBeenCalled();
  });

  it("PDF : seulement un vrai PDF est relayé ; refus → 403 ; numéro fabriqué jamais demandé", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 contenu");
    const ok = api(
      new Response(pdf, { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    expect(await ok.staff.invoicePdf(TOKEN, NUMBER)).toMatchObject({ status: 200 });
    const html = api(
      new Response("<html>", { status: 200, headers: { "content-type": "application/pdf" } }),
    );
    expect(await html.staff.invoicePdf(TOKEN, NUMBER)).toEqual({ status: 503 });
    expect(await api(problem(403, "ACCES_REFUSE")).staff.invoicePdf(TOKEN, NUMBER)).toEqual({
      status: 403,
    });
    const none = api(json(200, {}));
    expect(await none.staff.invoicePdf(TOKEN, "KMD-F-2026-1")).toEqual({ status: 404 });
    expect(none.fetch).not.toHaveBeenCalled();
  });

  it("encaissement, remboursement, code promo : bonnes routes, corps attendu, erreurs métier gardées", async () => {
    const cod = api(problem(409, "ENCAISSEMENT_IMPOSSIBLE"));
    expect(await cod.staff.codCollected(TOKEN, "KMD-7F3K9Q", 15_000)).toEqual({
      ok: false,
      code: "ENCAISSEMENT_IMPOSSIBLE",
    });
    expect(sent(cod.fetch)).toMatchObject({
      url: "http://serveur.test:4000/api/v1/admin/orders/KMD-7F3K9Q/cod-collected",
      body: { amount: 15_000 },
    });
    const refund = api(problem(409, "REMBOURSEMENT_DEJA_FAIT"));
    expect(
      await refund.staff.refundDone(TOKEN, "99999999-9999-4999-8999-999999999999", "AM-123"),
    ).toEqual({ ok: false, code: "REMBOURSEMENT_DEJA_FAIT" });
    expect(sent(refund.fetch).body).toEqual({ externalReference: "AM-123" });
    const coupon = api(problem(409, "COUPON_EXISTE"));
    expect(
      await coupon.staff.setCouponActive(TOKEN, "99999999-9999-4999-8999-999999999999", false),
    ).toEqual({ ok: false, code: "COUPON_EXISTE" });
    expect(sent(coupon.fetch)).toMatchObject({ method: "PATCH", body: { active: false } });
    const none = api(json(200, {}));
    expect(await none.staff.codCollected(TOKEN, "../x", 1)).toMatchObject({ ok: false });
    expect(await none.staff.refundDone(TOKEN, "x", "AM-123")).toMatchObject({ ok: false });
    expect(none.fetch).not.toHaveBeenCalled();
  });

  it("journal : action, compte et position dans l'adresse ; compte fabriqué ignoré", async () => {
    const { fetch, staff } = api(json(200, { items: [], nextCursor: null }));
    await staff.audit(TOKEN, {
      action: "invoice.resent",
      accountId: "99999999-9999-4999-8999-999999999999",
    });
    expect(sent(fetch).url).toBe(
      "http://serveur.test:4000/api/v1/admin/audit?limit=50&action=invoice.resent&accountId=99999999-9999-4999-8999-999999999999",
    );
    const other = api(json(200, { items: [], nextCursor: null }));
    await other.staff.audit(TOKEN, { accountId: "x&action=role.granted" });
    expect(sent(other.fetch).url).toBe("http://serveur.test:4000/api/v1/admin/audit?limit=50");
  });
});
