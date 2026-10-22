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
  decideKyc: vi.fn(),
  shipmentStep: vi.fn(),
  updateTariffs: vi.fn(),
  updateListing: vi.fn(),
  removeListingImage: vi.fn(),
  mergeListing: vi.fn(),
  withdrawOffer: vi.fn(),
  closeCorrection: vi.fn(),
  lookupAccount: vi.fn(),
  setRole: vi.fn(),
  staffAction: vi.fn(),
  supportLookup: vi.fn(),
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

describe("vérification des vendeurs (S6-T08)", () => {
  it("valider : retour au dossier avec un avis ; refuser : motif revérifié avant l'API", async () => {
    api.decideKyc.mockResolvedValue({ ok: true, data: undefined });
    expect(
      await redirectOf(actions.decideKycAction(form({ shopId: SHOP, decision: "approve" }))),
    ).toBe(`/equipe/verifications/${SHOP}?ok=kyc-valide`);
    for (const reason of ["", "abc", "x".repeat(301)]) {
      expect(
        await redirectOf(
          actions.decideKycAction(form({ shopId: SHOP, decision: "reject", reason })),
        ),
      ).toBe(`/equipe/verifications/${SHOP}?erreur=KYC_INVALIDE`);
    }
    expect(api.decideKyc).toHaveBeenCalledTimes(1);
    expect(
      await redirectOf(actions.decideKycAction(form({ shopId: "../x", decision: "approve" }))),
    ).toBe("/equipe/verifications");
  });
});

describe("livraisons (S7-T02)", () => {
  const REF = "KMD-7F3K9Q";

  it("remise au transporteur : retour à la liste ; autres étapes : retour à la fiche", async () => {
    api.shipmentStep.mockResolvedValue({ ok: true, data: {} });
    expect(
      await redirectOf(actions.shipmentStepAction(form({ reference: REF, step: "hand-over" }))),
    ).toBe("/equipe/livraisons?ok=livraison-remise");
    expect(
      await redirectOf(actions.shipmentStepAction(form({ reference: REF, step: "delivered" }))),
    ).toBe(`/equipe/livraisons/${REF}?ok=livraison-livree`);
    expect(api.shipmentStep).toHaveBeenLastCalledWith(TOKEN, REF, "delivered", undefined);
  });

  it("échec et annulation : texte de 3 à 200 caractères revérifié avant l'API", async () => {
    api.shipmentStep.mockResolvedValue({ ok: true, data: {} });
    for (const reason of ["", "ab", "x".repeat(201)]) {
      expect(
        await redirectOf(
          actions.shipmentStepAction(form({ reference: REF, step: "failed", reason })),
        ),
      ).toBe(`/equipe/livraisons/${REF}?erreur=EXPEDITION_INVALIDE`);
    }
    expect(api.shipmentStep).not.toHaveBeenCalled();
    expect(
      await redirectOf(
        actions.shipmentStepAction(
          form({ reference: REF, step: "cancel", reason: "  Client injoignable  " }),
        ),
      ),
    ).toBe(`/equipe/livraisons/${REF}?ok=livraison-annulee`);
    expect(api.shipmentStep).toHaveBeenCalledWith(TOKEN, REF, "cancel", "Client injoignable");
  });

  it("numéro ou étape inconnus : retour à la liste sans appel ; refus de l'API : code dans l'adresse", async () => {
    for (const bad of [
      { reference: "../admin", step: "delivered" },
      { reference: REF, step: "supprimer" },
    ]) {
      expect(await redirectOf(actions.shipmentStepAction(form(bad)))).toBe("/equipe/livraisons");
    }
    expect(api.shipmentStep).not.toHaveBeenCalled();
    api.shipmentStep.mockResolvedValue({ ok: false, code: "STATUT_EXPEDITION_INCOMPATIBLE" });
    expect(
      await redirectOf(actions.shipmentStepAction(form({ reference: REF, step: "retry" }))),
    ).toBe(`/equipe/livraisons/${REF}?erreur=STATUT_EXPEDITION_INCOMPATIBLE`);
    api.shipmentStep.mockResolvedValue({ ok: false, code: "DEUX_FACTEURS_REQUIS" });
    expect(
      await redirectOf(actions.shipmentStepAction(form({ reference: REF, step: "retry" }))),
    ).toBe(`/equipe/confirmer?retour=${encodeURIComponent(`/equipe/livraisons/${REF}`)}`);
  });

  const tariffs = (change: Record<string, string> = {}) => {
    const values: Record<string, string> = {};
    for (const id of ["zone_1", "zone_2", "zone_3", "zone_4"]) {
      values[`${id}.baseFee`] = "2 000";
      values[`${id}.freeThreshold`] = "50000";
      values[`${id}.daysMin`] = "2";
      values[`${id}.daysMax`] = "3";
    }
    return form({ ...values, ...change });
  };

  it("barème : 4 zones en nombres entiers (espaces tolérés), envoyé à l'API", async () => {
    api.updateTariffs.mockResolvedValue({ ok: true, data: {} });
    expect(await redirectOf(actions.updateTariffsAction(tariffs()))).toBe(
      "/equipe/livraisons/bareme?ok=bareme-enregistre",
    );
    const sent = api.updateTariffs.mock.calls[0]![1] as { zones: unknown[] };
    expect(sent.zones).toHaveLength(4);
    expect(sent.zones[0]).toEqual({
      id: "zone_1",
      baseFee: 2000,
      freeThreshold: 50000,
      daysMin: 2,
      daysMax: 3,
    });
  });

  it("barème invalide : refusé avant l'API", async () => {
    const changes: Record<string, string>[] = [
      { "zone_2.baseFee": "-5" },
      { "zone_2.baseFee": "12,5" },
      { "zone_3.baseFee": "100001" },
      { "zone_4.daysMin": "5", "zone_4.daysMax": "1" },
      { "zone_1.freeThreshold": "" },
    ];
    for (const change of changes) {
      expect(await redirectOf(actions.updateTariffsAction(tariffs(change)))).toBe(
        "/equipe/livraisons/bareme?erreur=TARIFS_INVALIDES",
      );
    }
    expect(api.updateTariffs).not.toHaveBeenCalled();
  });
});

describe("fiches produits (S7.5-T03)", () => {
  const LISTING = "77777777-7777-4777-8777-777777777777";
  const TARGET = "88888888-8888-4888-8888-888888888888";
  const LV = "99999999-9999-4999-8999-999999999999";
  const TV = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const PAGE = `/equipe/fiches/${LISTING}`;

  it("correction : seuls les champs changés partent ; marque vide = sans marque", async () => {
    api.updateListing.mockResolvedValue({ ok: true, data: {} });
    const f = form({
      listingId: LISTING,
      title: " Téléphone X ",
      brand: "",
      [`variant-${LV}`]: "Noir 128 Go",
      [`variant-before-${LV}`]: "Noir 128 Go",
      newVariant: "Vert",
    });
    f.append("variantIds", LV);
    expect(await redirectOf(actions.updateListingAction(f))).toBe(`${PAGE}?ok=fiche-corrigee`);
    expect(api.updateListing).toHaveBeenCalledWith(TOKEN, LISTING, {
      title: "Téléphone X",
      brand: null,
      variants: [{ name: "Vert" }],
    });
    expect(await redirectOf(actions.updateListingAction(form({ listingId: "x" })))).toBe(
      "/equipe/fiches",
    );
  });

  it("fusion : correspondance des déclinaisons ; un refus revient sur l'étape de la cible", async () => {
    api.mergeListing.mockResolvedValueOnce({ ok: false, code: "FUSION_IMPOSSIBLE" });
    const f = form({ listingId: LISTING, into: TARGET, [`map-${LV}`]: TV });
    f.append("sourceVariantIds", LV);
    expect(await redirectOf(actions.mergeListingAction(f))).toBe(
      `${PAGE}?fusion=${TARGET}&erreur=FUSION_IMPOSSIBLE`,
    );
    expect(api.mergeListing).toHaveBeenCalledWith(TOKEN, LISTING, TARGET, { [LV]: TV });
    api.mergeListing.mockResolvedValueOnce({ ok: true, data: {} });
    expect(await redirectOf(actions.mergeListingAction(f))).toBe(
      `/equipe/fiches/${TARGET}?ok=fiche-fusionnee`,
    );
  });

  it("retrait d'une offre : motif obligatoire", async () => {
    expect(
      await redirectOf(
        actions.withdrawOfferAction(form({ listingId: LISTING, productId: PRODUCT, reason: "x" })),
      ),
    ).toBe(`${PAGE}?erreur=PRODUIT_INVALIDE`);
    api.withdrawOffer.mockResolvedValue({ ok: true, data: {} });
    expect(
      await redirectOf(
        actions.withdrawOfferAction(
          form({ listingId: LISTING, productId: PRODUCT, reason: "Prix abusif" }),
        ),
      ),
    ).toBe(`${PAGE}?ok=offre-retiree`);
    expect(api.withdrawOffer).toHaveBeenCalledWith(TOKEN, PRODUCT, "Prix abusif");
  });

  it("clôture d'une proposition : retour validé (jamais vers un autre site)", async () => {
    api.closeCorrection.mockResolvedValue({ ok: true, data: {} });
    const id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    expect(
      await redirectOf(
        actions.closeCorrectionAction(form({ correctionId: id, back: PAGE, note: " Merci " })),
      ),
    ).toBe(`${PAGE}?ok=correction-close`);
    expect(api.closeCorrection).toHaveBeenCalledWith(TOKEN, id, "Merci");
    expect(
      await redirectOf(
        actions.closeCorrectionAction(form({ correctionId: id, back: "https://pirate.test/x" })),
      ),
    ).toBe("/equipe/fiches?ok=correction-close");
  });
});

describe("équipe et service client (S7.5-T04)", () => {
  const ACCOUNT = "99999999-9999-4999-8999-999999999999";
  const VIEW = {
    id: ACCOUNT,
    firstName: "Awa",
    lastName: "Ndong",
    email: "awa@exemple.ga",
    phone: null,
    roles: ["client"],
    status: "active",
    createdAt: SUBMITTED,
  };

  it("recherche : identifiant revérifié, résultat rendu au seul navigateur qui l'a demandé", async () => {
    expect(await actions.lookupStaffAccountAction(null, form({ identifier: "  " }))).toMatchObject({
      ok: false,
    });
    expect(
      await actions.lookupStaffAccountAction(null, form({ identifier: "x".repeat(301) })),
    ).toMatchObject({ ok: false });
    expect(api.lookupAccount).not.toHaveBeenCalled();
    api.lookupAccount.mockResolvedValue({ ok: true, data: VIEW });
    expect(
      await actions.lookupStaffAccountAction(null, form({ identifier: " awa@exemple.ga " })),
    ).toEqual({ ok: true, account: VIEW });
    expect(api.lookupAccount).toHaveBeenCalledWith(TOKEN, "awa@exemple.ga");
    api.supportLookup.mockResolvedValue({ ok: false, code: "COMPTE_INTROUVABLE" });
    expect(
      await actions.supportLookupAction(null, form({ identifier: "awa@exemple.ga" })),
    ).toMatchObject({ ok: false, message: expect.any(String) });
  });

  it("rôle : liste fermée (jamais « admin »), puis retour à l'écran avec l'avis", async () => {
    expect(
      await redirectOf(
        actions.setStaffRoleAction(form({ accountId: ACCOUNT, role: "admin", grant: "1" })),
      ),
    ).toBe("/equipe/utilisateurs");
    expect(api.setRole).not.toHaveBeenCalled();
    api.setRole.mockResolvedValue({ ok: true, data: VIEW });
    expect(
      await redirectOf(
        actions.setStaffRoleAction(form({ accountId: ACCOUNT, role: "support", grant: "1" })),
      ),
    ).toBe("/equipe/utilisateurs?ok=role-accorde");
    expect(api.setRole).toHaveBeenCalledWith(TOKEN, ACCOUNT, "support", true);
    api.setRole.mockResolvedValue({ ok: false, code: "ROLE_SUR_SOI_INTERDIT" });
    expect(
      await redirectOf(
        actions.setStaffRoleAction(form({ accountId: ACCOUNT, role: "catalog", grant: "0" })),
      ),
    ).toBe("/equipe/utilisateurs?erreur=ROLE_SUR_SOI_INTERDIT");
  });

  it("retirer, désactiver : case « Je confirme » obligatoire ; motif nettoyé ; réactiver sans case", async () => {
    expect(
      await redirectOf(
        actions.staffAccountAction(form({ accountId: ACCOUNT, action: "remove-staff" })),
      ),
    ).toBe("/equipe/utilisateurs?erreur=CONFIRMATION_REQUISE");
    expect(
      await redirectOf(
        actions.staffAccountAction(
          form({ accountId: ACCOUNT, action: "disable", confirme: "oui", reason: "non" }),
        ),
      ),
    ).toBe("/equipe/utilisateurs?erreur=MOTIF_INVALIDE");
    expect(api.staffAction).not.toHaveBeenCalled();
    api.staffAction.mockResolvedValue({ ok: true, data: { account: VIEW, sessionsClosed: 1 } });
    expect(
      await redirectOf(
        actions.staffAccountAction(
          form({
            accountId: ACCOUNT,
            action: "disable",
            confirme: "oui",
            reason: "  Fin   de contrat ",
          }),
        ),
      ),
    ).toBe("/equipe/utilisateurs?ok=compte-desactive");
    expect(api.staffAction).toHaveBeenCalledWith(TOKEN, ACCOUNT, "disable", "Fin de contrat");
    expect(
      await redirectOf(actions.staffAccountAction(form({ accountId: ACCOUNT, action: "enable" }))),
    ).toBe("/equipe/utilisateurs?ok=compte-reactive");
    expect(
      await redirectOf(actions.staffAccountAction(form({ accountId: "x", action: "enable" }))),
    ).toBe("/equipe/utilisateurs");
  });
});
