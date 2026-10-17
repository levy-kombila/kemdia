import { describe, expect, it } from "vitest";
import {
  decideKyc,
  editKyc,
  missingDocuments,
  requiredDocuments,
  submitKyc,
  validateKyc,
  type KycFile,
} from "./kyc.js";

const SHOP = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-17T10:00:00Z");

const INPUT = {
  holderKind: "individual" as const,
  legalName: "  Awa   Ndong ",
  idType: "cni" as const,
  idNumber: "ga 123-456 789",
  rccmNumber: null,
  payoutMethod: "airtel" as const,
  payoutAccount: "077 12 34 56",
  payoutHolder: "Awa Ndong",
};

const code = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return null;
};

function withDocs(file: KycFile, kinds: KycFile["documents"][number]["kind"][]): KycFile {
  return { ...file, documents: kinds.map((kind) => ({ kind, uploadedAt: NOW })) };
}

describe("dossier de vérification (S6-T08, BR-024)", () => {
  it("saisie mise en forme : nom sans espaces en trop, numéro en majuscules, mobile au format +241", () => {
    const details = validateKyc(INPUT);
    expect(details).toMatchObject({
      legalName: "Awa Ndong",
      idNumber: "GA123456789",
      payoutAccount: "+241077123456",
      rccmNumber: null,
    });
  });

  it("refus : opérateur et numéro qui ne vont pas ensemble, RCCM manquant ou en trop, compte bancaire mal formé", () => {
    expect(code(() => validateKyc({ ...INPUT, payoutMethod: "moov" }))).toBe("KYC_INVALIDE");
    expect(code(() => validateKyc({ ...INPUT, holderKind: "company" }))).toBe("KYC_INVALIDE");
    expect(code(() => validateKyc({ ...INPUT, rccmNumber: "RG LBV 2024 B 123" }))).toBe(
      "KYC_INVALIDE",
    );
    expect(
      code(() => validateKyc({ ...INPUT, payoutMethod: "bank", payoutAccount: "12-34" })),
    ).toBe("KYC_INVALIDE");
    expect(code(() => validateKyc({ ...INPUT, idNumber: "12" }))).toBe("KYC_INVALIDE");
    expect(code(() => validateKyc({ ...INPUT, legalName: "A" }))).toBe("KYC_INVALIDE");
    expect(
      validateKyc({
        ...INPUT,
        holderKind: "company",
        rccmNumber: " rg lbv 2024 b 123 ",
        payoutMethod: "bank",
        payoutAccount: "GA21 4002 1010 0123 4567 8901 234",
      }),
    ).toMatchObject({
      rccmNumber: "RG LBV 2024 B 123",
      payoutAccount: "GA214002101001234567890123" + "4",
    });
  });

  it("photos demandées : verso sauf passeport, RCCM pour une entreprise", () => {
    expect(requiredDocuments({ idType: "cni", holderKind: "individual" })).toEqual([
      "id_front",
      "id_back",
    ]);
    expect(requiredDocuments({ idType: "passeport", holderKind: "company" })).toEqual([
      "id_front",
      "rccm",
    ]);
  });

  it("envoi : refusé tant qu'une photo manque ; puis en attente ; plus modifiable", () => {
    const draft = editKyc(null, SHOP, validateKyc(INPUT));
    expect(draft).toMatchObject({ status: "draft", idNumberEnd: "6789", payoutAccountEnd: "3456" });
    expect(code(() => submitKyc(withDocs(draft, ["id_front"]), NOW))).toBe("KYC_INCOMPLET");
    const sent = submitKyc(withDocs(draft, ["id_front", "id_back"]), NOW);
    expect(sent).toMatchObject({ status: "pending", submittedAt: NOW });
    expect(code(() => editKyc(sent, SHOP, validateKyc(INPUT)))).toBe("STATUT_KYC_INCOMPATIBLE");
  });

  it("décision : motif obligatoire pour un refus ; photos effacées 30 jours après ; refus corrigé = brouillon", () => {
    const sent = submitKyc(
      withDocs(editKyc(null, SHOP, validateKyc(INPUT)), ["id_front", "id_back"]),
      NOW,
    );
    expect(
      code(() => decideKyc(sent, "reject", { adminId: ADMIN, reason: "flou", now: NOW })),
    ).toBe("KYC_INVALIDE");
    const rejected = decideKyc(sent, "reject", {
      adminId: ADMIN,
      reason: "Photo du recto illisible",
      now: NOW,
    });
    expect(rejected.documentsPurgeAt).toEqual(new Date("2026-11-16T10:00:00Z"));
    expect(
      code(() => decideKyc(rejected, "approve", { adminId: ADMIN, reason: null, now: NOW })),
    ).toBe("STATUT_KYC_INCOMPATIBLE");
    // Passeport : le verso n'est plus demandé, il est retiré du dossier
    const fixed = editKyc(rejected, SHOP, validateKyc({ ...INPUT, idType: "passeport" }));
    expect(fixed).toMatchObject({ status: "draft", rejectionReason: null, documentsPurgeAt: null });
    expect(fixed.documents.map((d) => d.kind)).toEqual(["id_front"]);
    expect(missingDocuments(fixed)).toEqual([]);
    const approved = decideKyc(submitKyc(fixed, NOW), "approve", {
      adminId: ADMIN,
      reason: null,
      now: NOW,
    });
    expect(approved).toMatchObject({
      status: "approved",
      reviewedBy: ADMIN,
      rejectionReason: null,
    });
    expect(code(() => editKyc(approved, SHOP, validateKyc(INPUT)))).toBe("STATUT_KYC_INCOMPATIBLE");
  });
});
