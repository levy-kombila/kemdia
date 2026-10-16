import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Actions serveur de l'espace de l'équipe (S6-T05) : jeton lu dans le cookie (jamais reçu du navigateur), arguments
 * revérifiés avant tout appel, redirections sûres. `next/headers`, `next/navigation` et l'API sont remplacés.
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
  notFound: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentAccount: vi.fn(), forgetSession: vi.fn() }));
vi.mock("@/lib/config/server-config", () => ({
  catalogSource: () => ({ url: "http://serveur.test:4000", key: "k".repeat(40), timeoutMs: 1000 }),
}));
const api = vi.hoisted(() => ({
  setupSecondFactor: vi.fn(),
  enableSecondFactor: vi.fn(),
  verifySecondFactor: vi.fn(),
  regenerateRecoveryCodes: vi.fn(),
  decideShop: vi.fn(),
  decideProduct: vi.fn(),
}));
vi.mock("./api-staff", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api-staff")>()),
  createStaffApi: () => api,
}));

const { SESSION_COOKIE } = await import("@/lib/auth/cookies");
const { forgetSession } = await import("@/lib/auth/session");
const actions = await import("./actions");

const TOKEN = "T".repeat(43);
const SHOP = "11111111-1111-4111-8111-111111111111";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const SUBMITTED = "2026-10-16T18:00:00.000Z";
const URI =
  "otpauth://totp/Kemdia:ines%40kemdia.ga?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Kemdia";

const form = (entries: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(entries)) f.set(k, v);
  return f;
};
/** URL de la redirection levée par l'action. */
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

describe("double authentification", () => {
  it("QR code : mot de passe revérifié, dessin calculé sur le serveur", async () => {
    expect(await actions.setupSecondFactorAction(42)).toMatchObject({ ok: false });
    expect(await actions.setupSecondFactorAction("x".repeat(201))).toMatchObject({ ok: false });
    expect(api.setupSecondFactor).not.toHaveBeenCalled();
    api.setupSecondFactor.mockResolvedValue({
      ok: true,
      data: { secret: "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP", otpauthUri: URI },
    });
    const result = await actions.setupSecondFactorAction("Mon-Mot-De-Passe-1");
    expect(api.setupSecondFactor).toHaveBeenCalledWith(TOKEN, "Mon-Mot-De-Passe-1");
    expect(result).toMatchObject({ ok: true, otpauthUri: URI, qr: { size: expect.any(Number) } });
  });

  it("sans session : rien n'est appelé", async () => {
    jar.clear();
    expect(await actions.setupSecondFactorAction("x")).toMatchObject({
      ok: false,
      signedOut: true,
    });
    expect(await actions.enableSecondFactorAction("123456")).toMatchObject({ signedOut: true });
    expect(await actions.verifySecondFactorAction("123456", "/equipe")).toMatchObject({
      signedOut: true,
    });
    expect(api.setupSecondFactor).not.toHaveBeenCalled();
    expect(api.enableSecondFactor).not.toHaveBeenCalled();
    expect(api.verifySecondFactor).not.toHaveBeenCalled();
  });

  it("activation : seulement 6 chiffres ; les codes de secours reviennent une fois", async () => {
    for (const bad of ["12345", "abcdef", "1234567", 123456, "abcd-efgh-jkmn"]) {
      expect(await actions.enableSecondFactorAction(bad)).toMatchObject({ ok: false });
    }
    expect(api.enableSecondFactor).not.toHaveBeenCalled();
    const codes = Array.from({ length: 10 }, (_, i) => `abc${i + 2}-efgh-jkmn`);
    api.enableSecondFactor.mockResolvedValue({
      ok: true,
      data: { recoveryCodes: codes, verifiedUntil: SUBMITTED },
    });
    expect(await actions.enableSecondFactorAction(" 123456 ")).toEqual({
      ok: true,
      recoveryCodes: codes,
    });
    expect(api.enableSecondFactor).toHaveBeenCalledWith(TOKEN, "123456");
  });

  it("confirmation : retour à une page de l'équipe seulement", async () => {
    api.verifySecondFactor.mockResolvedValue({
      ok: true,
      data: { verifiedUntil: SUBMITTED, recoveryCodesLeft: 9 },
    });
    expect(await redirectOf(actions.verifySecondFactorAction("123456", "/equipe/moderation"))).toBe(
      "/equipe/moderation",
    );
    expect(
      await redirectOf(
        actions.verifySecondFactorAction("abcd-efgh-jkmn", "https://pirate.example"),
      ),
    ).toBe("/equipe");
    expect(await redirectOf(actions.verifySecondFactorAction("123456", "/compte"))).toBe("/equipe");
    // Champ démesuré ou caractères inattendus : rien n'est envoyé
    expect(await actions.verifySecondFactorAction("<script>", "/equipe")).toMatchObject({
      ok: false,
    });
    expect(api.verifySecondFactor).toHaveBeenCalledTimes(3);
  });

  it("trop de codes faux : l'API a fermé la session, le cookie de ce navigateur est effacé", async () => {
    api.verifySecondFactor.mockResolvedValue({
      ok: false,
      code: "TROP_D_ESSAIS",
      retryAfterSeconds: 900,
    });
    const result = await actions.verifySecondFactorAction("000000", "/equipe");
    expect(result).toMatchObject({
      ok: false,
      signedOut: true,
      message: expect.stringMatching(/15 minutes/),
    });
    expect(forgetSession).toHaveBeenCalledWith(TOKEN);
    expect(set).toHaveBeenCalledWith(SESSION_COOKIE, "", expect.objectContaining({ maxAge: 0 }));
  });

  it("code faux : message, la session reste ouverte", async () => {
    api.verifySecondFactor.mockResolvedValue({ ok: false, code: "CODE_INVALIDE" });
    const result = await actions.verifySecondFactorAction("000000", "/equipe");
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/Code incorrect/) });
    expect(result).not.toHaveProperty("signedOut");
    expect(set).not.toHaveBeenCalled();
  });

  it("nouveaux codes de secours : contre un code de l'application seulement", async () => {
    expect(await actions.regenerateRecoveryCodesAction("abcd-efgh-jkmn")).toMatchObject({
      ok: false,
    });
    expect(api.regenerateRecoveryCodes).not.toHaveBeenCalled();
  });
});

describe("décision sur une boutique", () => {
  it("valider : appel puis retour à la fiche avec l'avis", async () => {
    api.decideShop.mockResolvedValue({ ok: true, data: {} });
    const url = await redirectOf(
      actions.decideShopAction(form({ shopId: SHOP.toUpperCase(), decision: "approve" })),
    );
    expect(api.decideShop).toHaveBeenCalledWith(TOKEN, SHOP.toUpperCase(), "approve", undefined);
    expect(url).toBe(`/equipe/boutiques/${SHOP}?ok=boutique-validee`);
  });

  it("refuser ou suspendre : motif obligatoire (5 à 300 caractères), revérifié avant l'API", async () => {
    for (const reason of ["", "   abc  ", "x".repeat(301)]) {
      const url = await redirectOf(
        actions.decideShopAction(form({ shopId: SHOP, decision: "reject", reason })),
      );
      expect(url).toBe(`/equipe/boutiques/${SHOP}?erreur=BOUTIQUE_INVALIDE`);
    }
    expect(api.decideShop).not.toHaveBeenCalled();
    api.decideShop.mockResolvedValue({ ok: true, data: {} });
    await redirectOf(
      actions.decideShopAction(
        form({ shopId: SHOP, decision: "suspend", reason: "  Vente interdite  " }),
      ),
    );
    expect(api.decideShop).toHaveBeenCalledWith(TOKEN, SHOP, "suspend", "Vente interdite");
  });

  it("formulaire trafiqué : décision ou identifiant inconnus → liste, sans appel", async () => {
    const tampered: Record<string, string>[] = [
      { shopId: SHOP, decision: "delete" },
      { shopId: "../admin", decision: "approve" },
      { decision: "approve" },
    ];
    for (const entries of tampered) {
      expect(await redirectOf(actions.decideShopAction(form(entries)))).toBe("/equipe/boutiques");
    }
    expect(api.decideShop).not.toHaveBeenCalled();
  });

  it("refus de l'API : 2FA à confirmer → code puis retour ; erreur métier → fiche avec le code", async () => {
    api.decideShop.mockResolvedValue({ ok: false, code: "DEUX_FACTEURS_REQUIS" });
    expect(
      await redirectOf(actions.decideShopAction(form({ shopId: SHOP, decision: "approve" }))),
    ).toBe(`/equipe/confirmer?retour=${encodeURIComponent(`/equipe/boutiques/${SHOP}`)}`);
    api.decideShop.mockResolvedValue({ ok: false, code: "STATUT_BOUTIQUE_INCOMPATIBLE" });
    expect(
      await redirectOf(actions.decideShopAction(form({ shopId: SHOP, decision: "approve" }))),
    ).toBe(`/equipe/boutiques/${SHOP}?erreur=STATUT_BOUTIQUE_INCOMPATIBLE`);
    api.decideShop.mockResolvedValue({ ok: false, code: "SESSION_INVALIDE" });
    expect(
      await redirectOf(actions.decideShopAction(form({ shopId: SHOP, decision: "approve" }))),
    ).toBe(`/connexion?retour=${encodeURIComponent(`/equipe/boutiques/${SHOP}`)}`);
    expect(forgetSession).toHaveBeenCalledWith(TOKEN);
  });
});

describe("décision sur un produit", () => {
  it("valider la version lue : retour à la file avec l'avis", async () => {
    api.decideProduct.mockResolvedValue({ ok: true, data: {} });
    const url = await redirectOf(
      actions.decideProductAction(
        form({ productId: PRODUCT, decision: "approve", submittedAt: SUBMITTED }),
      ),
    );
    expect(api.decideProduct).toHaveBeenCalledWith(TOKEN, PRODUCT, "approve", SUBMITTED, undefined);
    expect(url).toBe("/equipe/moderation?ok=produit-valide");
  });

  it("sans version lue valide : rien n'est envoyé", async () => {
    for (const submittedAt of ["", "hier", "2026-10-16", "2026-10-16T18:00:00+01:00"]) {
      expect(
        await redirectOf(
          actions.decideProductAction(
            form({ productId: PRODUCT, decision: "approve", submittedAt }),
          ),
        ),
      ).toBe("/equipe/moderation");
    }
    expect(api.decideProduct).not.toHaveBeenCalled();
  });

  it("produit modifié par le vendeur pendant la lecture : retour à la fiche avec le code", async () => {
    api.decideProduct.mockResolvedValue({ ok: false, code: "PRODUIT_MODIFIE" });
    expect(
      await redirectOf(
        actions.decideProductAction(
          form({
            productId: PRODUCT,
            decision: "reject",
            submittedAt: SUBMITTED,
            reason: "Photo floue",
          }),
        ),
      ),
    ).toBe(`/equipe/moderation/${PRODUCT}?erreur=PRODUIT_MODIFIE`);
    expect(api.decideProduct).toHaveBeenCalledWith(
      TOKEN,
      PRODUCT,
      "reject",
      SUBMITTED,
      "Photo floue",
    );
  });
});
