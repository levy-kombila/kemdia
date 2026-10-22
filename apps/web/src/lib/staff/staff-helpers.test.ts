import { encode } from "uqr";
import { describe, expect, it } from "vitest";
import { staffErrorFromParam, staffErrorMessage, staffNotice } from "./messages";
import { categoryPathOf, staffImageSrc } from "./moderation-view";
import { qrDrawing } from "./qr";
import { canAccess, confirmedUntil, isAdmin, isStaff, staffPath } from "./roles";

const PRODUCT = "22222222-2222-4222-8222-222222222222";
const IMAGE = "33333333-3333-4333-8333-333333333333";

describe("rôles de l'équipe", () => {
  it("cinq rôles de l'équipe ; client et vendeur n'en font pas partie", () => {
    expect(isStaff(["client"])).toBe(false);
    expect(isStaff(["client", "vendor"])).toBe(false);
    for (const role of ["catalog", "logistics", "finance", "support", "admin"] as const) {
      expect(isStaff(["client", role])).toBe(true);
    }
    expect(isAdmin(["client", "catalog"])).toBe(false);
    expect(isAdmin(["client", "admin"])).toBe(true);
  });

  it("chaque page à son rôle ; l'administrateur ouvre tout", () => {
    expect(canAccess(["client", "catalog"])).toBe(true);
    expect(canAccess(["client", "vendor"])).toBe(false);
    expect(canAccess(["client", "catalog"], "catalog")).toBe(true);
    expect(canAccess(["client", "catalog"], "logistics")).toBe(false);
    expect(canAccess(["client", "support"], "admin")).toBe(false);
    expect(canAccess(["client", "logistics", "support"], "support")).toBe(true);
    for (const role of ["catalog", "logistics", "finance", "support", "admin"] as const) {
      expect(canAccess(["client", "admin"], role)).toBe(true);
    }
  });
});

describe("adresse de retour (staffPath)", () => {
  it("garde une page de l'équipe", () => {
    expect(staffPath("/equipe")).toBe("/equipe");
    expect(staffPath("/equipe/moderation")).toBe("/equipe/moderation");
    expect(staffPath(`/equipe/moderation/${PRODUCT}`)).toBe(`/equipe/moderation/${PRODUCT}`);
    expect(staffPath("/equipe/boutiques?statut=active")).toBe("/equipe/boutiques?statut=active");
  });

  it.each([
    undefined,
    42,
    "",
    "/",
    "/compte",
    "https://pirate.example/equipe",
    "//pirate.example/equipe",
    "/equipe/../compte",
    "/equipe/%2e%2e/compte",
    "/equipe\\pirate",
    "/equipe/moderation#x",
    "/equipe/moderation?retour=https://pirate.example",
    "/equipe/ESPACE",
    "/equipeX",
    "/equipe/a/b/c/d/e",
    `/equipe/${"a".repeat(65)}`,
    // Pages de sécurité : jamais une destination (boucle)
    "/equipe/confirmer",
    "/equipe/confirmer?retour=/equipe",
    "/equipe/securite",
  ])("refuse %s → accueil de l'équipe", (value) => {
    expect(staffPath(value)).toBe("/equipe");
  });

  it("session confirmée seulement avant l'heure donnée par l'API", () => {
    const now = Date.parse("2026-10-16T18:00:00Z");
    expect(confirmedUntil({ verifiedUntil: null }, now)).toBeNull();
    expect(confirmedUntil({ verifiedUntil: "2026-10-16T18:00:00.000Z" }, now)).toBeNull();
    expect(confirmedUntil({ verifiedUntil: "2026-10-16T18:10:00.000Z" }, now)).toBe(
      "2026-10-16T18:10:00.000Z",
    );
  });
});

describe("messages de l'équipe", () => {
  it("code d'erreur lu dans l'adresse : seulement un code connu, texte toujours fourni par le site", () => {
    expect(staffErrorFromParam("PRODUIT_MODIFIE")).toMatch(/Relisez la nouvelle version/);
    expect(staffErrorFromParam("DEUX_FACTEURS_REQUIS")).toMatch(/code/);
    expect(staffErrorFromParam("INDISPONIBLE")).toMatch(/indisponible/);
    expect(staffErrorFromParam("CODE_INCONNU")).toBeNull();
    expect(staffErrorFromParam("toString")).toBeNull();
    expect(staffErrorFromParam("<script>")).toBeNull();
    expect(staffErrorFromParam(["PRODUIT_MODIFIE"])).toBeNull();
  });

  it("trop de codes faux : l'attente est donnée", () => {
    expect(staffErrorMessage("TROP_D_ESSAIS", 900)).toBe(
      "Trop de codes faux : par sécurité, vous avez été déconnecté. Reconnectez-vous dans 15 minutes.",
    );
  });

  it("avis après une décision : liste fermée", () => {
    expect(staffNotice("produit-valide")).toMatch(/visible sur le site/);
    expect(staffNotice("constructor")).toBeNull();
    expect(staffNotice("Votre compte est piraté")).toBeNull();
  });
});

describe("QR code dessiné par le serveur", () => {
  const URI =
    "otpauth://totp/Kemdia:ines%40kemdia.ga?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=Kemdia";

  it("le tracé ne contient que des rectangles et redonne exactement la matrice du QR code", () => {
    const { size, path } = qrDrawing(URI);
    expect(path).toMatch(/^(M\d+ \d+h\d+v1h-\d+z)+$/);
    const expected = encode(URI, { ecc: "M", border: 2 });
    expect(size).toBe(expected.size);
    const grid = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
    for (const [, x, y, w] of path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      for (let i = 0; i < Number(w); i++) grid[Number(y)]![Number(x) + i] = true;
    }
    expect(grid).toEqual(expected.data);
  });
});

describe("vue de modération", () => {
  it("photo : toujours le relais de l'équipe, jamais l'adresse publique", () => {
    expect(staffImageSrc(PRODUCT, `/images/v/${IMAGE}.webp`)).toBe(
      `/equipe/moderation/${PRODUCT}/photos/${IMAGE}`,
    );
    expect(staffImageSrc(PRODUCT, "/images/products/telephone.webp")).toBeNull();
    expect(staffImageSrc(PRODUCT, "https://pirate.example/x.webp")).toBeNull();
  });

  it("chemin de la catégorie dans l'arbre", () => {
    const node = (id: string, name: string, children: never[] = []) => ({
      id,
      name,
      slug: name.toLowerCase(),
      parentId: null,
      icon: "tag",
      image: null,
      children,
    });
    const tree = [{ ...node("a", "Mode"), children: [node("b", "Pagnes") as never] }];
    expect(categoryPathOf(tree, "b")).toBe("Mode › Pagnes");
    expect(categoryPathOf(tree, "z")).toBeNull();
  });
});

describe("journal et messages de la Finance (S7.5-T05)", () => {
  it("chaque action du journal a un libellé ; chaque code de la Finance a son message", async () => {
    const { AUDIT_ACTIONS, PAYMENT_ERROR_CODES, COUPON_ERROR_CODES } =
      await import("@kemdia/contracts/constants");
    const { AUDIT_ACTION_LABELS } = await import("./audit-labels");
    for (const action of AUDIT_ACTIONS) expect(AUDIT_ACTION_LABELS[action]).toBeTruthy();
    for (const code of [...PAYMENT_ERROR_CODES, ...COUPON_ERROR_CODES]) {
      expect(staffErrorMessage(code)).not.toBe(staffErrorMessage("INDISPONIBLE"));
      expect(staffErrorFromParam(code)).toBe(staffErrorMessage(code));
    }
    expect(staffErrorFromParam("REFERENCE_INVALIDE")).toContain("Référence refusée");
  });
});
