import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Actions serveur de l'espace vendeur (S6-T06) : jeton lu dans le cookie, arguments revérifiés avant tout appel,
 * redirections sûres. `next/headers`, `next/navigation` et l'API sont remplacés.
 */
const jar = new Map<string, string>();
const set = vi.fn((name: string, value: string) => {
  if (value) jar.set(name, value);
  else jar.delete(name);
});
vi.mock("next/headers", () => ({
  cookies: () =>
    Promise.resolve({
      get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
      set,
    }),
  headers: () => Promise.resolve(new Headers()),
}));
class Redirect extends Error {
  constructor(readonly url: string) {
    super("NEXT_REDIRECT");
  }
}
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Redirect(url);
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentAccount: vi.fn(), forgetSession: vi.fn() }));
vi.mock("@/lib/config/server-config", () => ({
  catalogSource: () => ({ url: "http://serveur.test:4000", key: "k".repeat(40), timeoutMs: 1000 }),
}));
const api = vi.hoisted(() => ({
  applyShop: vi.fn(),
  createProduct: vi.fn(),
  updateContent: vi.fn(),
  updateVariant: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  product: vi.fn(),
  reorderImages: vi.fn(),
  removeImage: vi.fn(),
  acceptOrder: vi.fn(),
  refuseOrder: vi.fn(),
  saveKyc: vi.fn(),
  submitKyc: vi.fn(),
}));
vi.mock("./api-vendor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api-vendor")>()),
  createVendorApi: () => api,
}));

const { SESSION_COOKIE } = await import("@/lib/auth/cookies");
const { forgetSession } = await import("@/lib/auth/session");
const actions = await import("./actions");

const TOKEN = "T".repeat(43);
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const VARIANT = "44444444-4444-4444-8444-444444444444";
const IMG_A = "33333333-3333-4333-8333-333333333333";
const IMG_B = "66666666-6666-4666-8666-666666666666";
const CATEGORY = "55555555-5555-4555-8555-555555555555";
const PAGE = `/vendeur/produits/${PRODUCT}`;

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};
async function redirectOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Redirect) return error.url;
    throw error;
  }
  throw new Error("aucune redirection");
}

beforeEach(() => {
  vi.clearAllMocks();
  jar.clear();
  jar.set(SESSION_COOKIE, TOKEN);
});

describe("demande de boutique", () => {
  const REQUEST = {
    name: "Couture Nzé",
    city: "Oyem",
    phone: "077 98 76 54",
    description: "Robes et chemises cousues à la main.",
  };

  it("revérifiée avant l'API ; mobile normalisé", async () => {
    expect(await actions.applyShopAction({ ...REQUEST, phone: "123" })).toMatchObject({
      ok: false,
      errors: { phone: expect.any(String) },
    });
    expect(api.applyShop).not.toHaveBeenCalled();
    api.applyShop.mockResolvedValue({ ok: true, data: {} });
    expect(await actions.applyShopAction(REQUEST)).toEqual({ ok: true });
    expect(api.applyShop).toHaveBeenCalledWith(TOKEN, { ...REQUEST, phone: "+241077987654" });
  });

  it("nom pris : signalé sur le champ ; sans session : rien n'est appelé", async () => {
    api.applyShop.mockResolvedValue({ ok: false, code: "NOM_BOUTIQUE_PRIS" });
    expect(await actions.applyShopAction(REQUEST)).toMatchObject({
      errors: { name: expect.stringMatching(/déjà pris/) },
    });
    jar.clear();
    expect(await actions.applyShopAction(REQUEST)).toMatchObject({ signedOut: true });
    expect(api.applyShop).toHaveBeenCalledTimes(1);
  });

  it("session refusée par l'API : oubliée et cookie effacé", async () => {
    api.applyShop.mockResolvedValue({ ok: false, code: "SESSION_INVALIDE" });
    expect(await actions.applyShopAction(REQUEST)).toMatchObject({ signedOut: true });
    expect(forgetSession).toHaveBeenCalledWith(TOKEN);
    expect(set).toHaveBeenCalledWith(SESSION_COOKIE, "", expect.objectContaining({ maxAge: 0 }));
  });
});

describe("produit", () => {
  const CONTENT = {
    title: "Chemise en pagne",
    description: "Chemise homme en pagne wax, coton, coupe droite.",
    brand: "",
    categoryId: CATEGORY,
  };

  it("création : fiche et variantes revérifiées, montants convertis", async () => {
    expect(await actions.createProductAction({ ...CONTENT, variants: [] })).toMatchObject({
      ok: false,
    });
    api.createProduct.mockResolvedValue({ ok: true, data: { id: PRODUCT } });
    expect(
      await actions.createProductAction({
        ...CONTENT,
        variants: [{ name: "M", price: "15 000", compareAtPrice: "", stock: "4" }],
      }),
    ).toEqual({ ok: true, id: PRODUCT });
    expect(api.createProduct).toHaveBeenCalledWith(TOKEN, {
      title: CONTENT.title,
      description: CONTENT.description,
      brand: null,
      categoryId: CATEGORY,
      variants: [{ name: "M", price: 15000, compareAtPrice: null, stock: 4 }],
    });
  });

  it("champ refusé par l'API : son explication est montrée", async () => {
    api.updateContent.mockResolvedValue({
      ok: false,
      code: "PRODUIT_INVALIDE",
      detail: "description : caractères invisibles",
    });
    expect(await actions.updateContentAction(PRODUCT, CONTENT)).toMatchObject({
      message: expect.stringContaining("caractères invisibles"),
    });
    expect(await actions.updateContentAction("../x", CONTENT)).toMatchObject({ ok: false });
    expect(api.updateContent).toHaveBeenCalledTimes(1);
  });
});

describe("variante", () => {
  const base = {
    productId: PRODUCT,
    variantId: VARIANT,
    price: "15000",
    compareAtPrice: "",
    stock: "4",
    previousStock: "4",
  };

  it("stock inchangé : pas envoyé ; stock changé : envoyé avec le stock lu", async () => {
    api.updateVariant.mockResolvedValue({ ok: true, data: {} });
    expect(await redirectOf(actions.updateVariantAction(form({ ...base, isActive: "on" })))).toBe(
      `${PAGE}?ok=variante-modifiee`,
    );
    expect(api.updateVariant).toHaveBeenLastCalledWith(TOKEN, PRODUCT, VARIANT, {
      price: 15000,
      compareAtPrice: null,
      isActive: true,
    });
    await redirectOf(actions.updateVariantAction(form({ ...base, stock: "9" })));
    expect(api.updateVariant).toHaveBeenLastCalledWith(TOKEN, PRODUCT, VARIANT, {
      price: 15000,
      compareAtPrice: null,
      isActive: false,
      stock: 9,
      previousStock: 4,
    });
  });

  it("valeurs invalides : rien n'est envoyé ; stock modifié entre-temps → message", async () => {
    for (const bad of [
      { price: "0" },
      { price: "abc" },
      { compareAtPrice: "100" },
      { stock: "-1" },
      { variantId: "x" },
    ]) {
      expect(await redirectOf(actions.updateVariantAction(form({ ...base, ...bad })))).toBe(
        `${PAGE}?erreur=PRODUIT_INVALIDE`,
      );
    }
    expect(api.updateVariant).not.toHaveBeenCalled();
    api.updateVariant.mockResolvedValue({ ok: false, code: "STOCK_MODIFIE" });
    expect(await redirectOf(actions.updateVariantAction(form({ ...base, stock: "2" })))).toBe(
      `${PAGE}?erreur=STOCK_MODIFIE`,
    );
  });

  it("produit trafiqué → liste ; boutique suspendue entre-temps → accueil de l'espace", async () => {
    expect(await redirectOf(actions.archiveProductAction(form({ productId: "../../x" })))).toBe(
      "/vendeur/produits",
    );
    api.archive.mockResolvedValue({ ok: false, code: "ACCES_REFUSE" });
    expect(await redirectOf(actions.archiveProductAction(form({ productId: PRODUCT })))).toBe(
      "/vendeur",
    );
  });
});

describe("photos", () => {
  const view = {
    ok: true,
    data: { images: [`/images/v/${IMG_A}.webp`, `/images/v/${IMG_B}.webp`] },
  };

  it("principale : ordre relu dans l'API, la photo choisie passe en premier", async () => {
    api.product.mockResolvedValue(view);
    api.reorderImages.mockResolvedValue({ ok: true, data: {} });
    expect(
      await redirectOf(actions.mainPhotoAction(form({ productId: PRODUCT, imageId: IMG_B }))),
    ).toBe(`${PAGE}?ok=photo-principale`);
    expect(api.reorderImages).toHaveBeenCalledWith(TOKEN, PRODUCT, [IMG_B, IMG_A]);
  });

  it("photo qui n'est pas celle du produit : refusée sans rien envoyer", async () => {
    api.product.mockResolvedValue(view);
    const other = "77777777-7777-4777-8777-777777777777";
    expect(
      await redirectOf(actions.mainPhotoAction(form({ productId: PRODUCT, imageId: other }))),
    ).toBe(`${PAGE}?erreur=PHOTO_INTROUVABLE`);
    expect(api.reorderImages).not.toHaveBeenCalled();
  });

  it("retrait : identifiant vérifié", async () => {
    expect(
      await redirectOf(actions.removePhotoAction(form({ productId: PRODUCT, imageId: "x" }))),
    ).toBe(`${PAGE}?erreur=PHOTO_INTROUVABLE`);
    api.removeImage.mockResolvedValue({ ok: true, data: {} });
    expect(
      await redirectOf(actions.removePhotoAction(form({ productId: PRODUCT, imageId: IMG_A }))),
    ).toBe(`${PAGE}?ok=photo-retiree`);
  });
});

describe("commandes (S6-T07)", () => {
  const REF = "KMD-ABC234";
  const ORDER_PAGE = `/vendeur/commandes/${REF}`;

  it("accepter : référence vérifiée avant l'API, retour à la fiche avec un avis", async () => {
    expect(await redirectOf(actions.acceptOrderAction(form({ reference: "../../admin" })))).toBe(
      "/vendeur/commandes",
    );
    expect(api.acceptOrder).not.toHaveBeenCalled();
    api.acceptOrder.mockResolvedValue({ ok: true, data: {} });
    expect(await redirectOf(actions.acceptOrderAction(form({ reference: REF })))).toBe(
      `${ORDER_PAGE}?ok=commande-acceptee`,
    );
    expect(api.acceptOrder).toHaveBeenCalledWith(TOKEN, REF);
  });

  it("refuser : motif de 5 à 300 caractères (espaces retirés), sinon aucun appel", async () => {
    for (const reason of ["", "  abc  ", "x".repeat(301)]) {
      expect(await redirectOf(actions.refuseOrderAction(form({ reference: REF, reason })))).toBe(
        `${ORDER_PAGE}?erreur=MOTIF_REFUS_INVALIDE`,
      );
    }
    expect(api.refuseOrder).not.toHaveBeenCalled();
    api.refuseOrder.mockResolvedValue({ ok: true, data: {} });
    expect(
      await redirectOf(
        actions.refuseOrderAction(form({ reference: REF, reason: "  Rupture de stock  " })),
      ),
    ).toBe(`${ORDER_PAGE}?ok=commande-refusee`);
    expect(api.refuseOrder).toHaveBeenCalledWith(TOKEN, REF, "Rupture de stock");
  });

  it("décision impossible : code dans l'adresse ; sans session : connexion", async () => {
    api.acceptOrder.mockResolvedValue({ ok: false, code: "DECISION_IMPOSSIBLE" });
    expect(await redirectOf(actions.acceptOrderAction(form({ reference: REF })))).toBe(
      `${ORDER_PAGE}?erreur=DECISION_IMPOSSIBLE`,
    );
    jar.clear();
    expect(await redirectOf(actions.acceptOrderAction(form({ reference: REF })))).toBe(
      `/connexion?retour=${encodeURIComponent(ORDER_PAGE)}`,
    );
  });
});

describe("vérification (S6-T08)", () => {
  const KYC = {
    holderKind: "individual",
    legalName: "Awa Ndong",
    idType: "cni",
    idNumber: "GA123456789",
    rccmNumber: "à ignorer",
    payoutMethod: "airtel",
    payoutAccount: "077987654",
    payoutHolder: "Awa Ndong",
  };

  it("enregistrer : choix revérifiés, RCCM ignoré pour une personne seule, avis", async () => {
    expect(await redirectOf(actions.saveKycAction(form({ ...KYC, idType: "permis" })))).toBe(
      "/vendeur/verification?erreur=KYC_INVALIDE",
    );
    expect(api.saveKyc).not.toHaveBeenCalled();
    api.saveKyc.mockResolvedValue({ ok: true, data: {} });
    expect(await redirectOf(actions.saveKycAction(form(KYC)))).toBe(
      "/vendeur/verification?ok=kyc-enregistre",
    );
    expect(api.saveKyc).toHaveBeenCalledWith(TOKEN, { ...KYC, rccmNumber: null });
  });

  it("champ refusé par l'API : seulement un nom de champ connu dans l'adresse", async () => {
    api.saveKyc.mockResolvedValue({
      ok: false,
      code: "KYC_INVALIDE",
      detail: "Compte Moov Money : numéro en 06… attendu",
    });
    expect(await redirectOf(actions.saveKycAction(form(KYC)))).toBe(
      "/vendeur/verification?erreur=KYC_INVALIDE&champ=payoutAccount",
    );
    api.saveKyc.mockResolvedValue({ ok: false, code: "KYC_INVALIDE", detail: "<script>" });
    expect(await redirectOf(actions.saveKycAction(form(KYC)))).toBe(
      "/vendeur/verification?erreur=KYC_INVALIDE",
    );
  });

  it("envoyer : avis, ou code d'erreur (photos manquantes)", async () => {
    api.submitKyc.mockResolvedValue({ ok: false, code: "KYC_INCOMPLET" });
    expect(await redirectOf(actions.submitKycAction())).toBe(
      "/vendeur/verification?erreur=KYC_INCOMPLET",
    );
    api.submitKyc.mockResolvedValue({ ok: true, data: {} });
    expect(await redirectOf(actions.submitKycAction())).toBe("/vendeur/verification?ok=kyc-envoye");
  });
});
