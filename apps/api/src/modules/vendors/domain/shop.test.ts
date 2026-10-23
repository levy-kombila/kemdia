import { describe, expect, it } from "vitest";
import {
  cleanLine,
  cleanText,
  decide,
  nameKeyOf,
  newShop,
  resubmit,
  slugOf,
  validateApplication,
  validateReason,
  type Shop,
} from "./shop.js";

const OWNER = "11111111-1111-4111-8111-111111111111";
const ADMIN = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-10-15T20:00:00.000Z");

const APPLICATION = {
  name: "  Chez   Ali Électronique ",
  city: " Libreville ",
  neighborhood: null,
  phone: "077 12 34 56",
  description: "Téléphones, chargeurs et accessoires d'origine, garantis 6 mois.",
};

const code = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return "aucune erreur";
};

const pending = (): Shop =>
  newShop(
    "33333333-3333-4333-8333-333333333333",
    OWNER,
    "chez-ali",
    validateApplication(APPLICATION),
    NOW,
  );

describe("Demande de boutique (S6-T01)", () => {
  it("nettoie les champs et normalise le mobile", () => {
    const app = validateApplication(APPLICATION);
    expect(app).toEqual({
      name: "Chez Ali Électronique",
      nameKey: "chez aii eiectronique",
      slugBase: "chez-ali-electronique",
      city: "Libreville",
      neighborhood: null,
      contactPhone: "+241077123456",
      description: "Téléphones, chargeurs et accessoires d'origine, garantis 6 mois.",
    });
  });

  it("deux noms qui ne diffèrent que par la casse, les accents ou la ponctuation ont la même clé", () => {
    expect(nameKeyOf("Chez Ali !")).toBe(nameKeyOf("chez-ali"));
    expect(nameKeyOf("CHÈZ   ALI")).toBe("chez aii");
  });

  it("les signes qui se ressemblent (l, 1, i ; 0, o) donnent la même clé, pas la même adresse", () => {
    expect(nameKeyOf("Chez A1i")).toBe(nameKeyOf("Chez Ali"));
    expect(nameKeyOf("B0utique Ndong")).toBe(nameKeyOf("Boutique Ndong"));
    expect(validateApplication({ ...APPLICATION, name: "Chez Ali" }).slugBase).toBe("chez-ali");
    expect(validateApplication({ ...APPLICATION, name: "Œuvres d'Awa" }).slugBase).toBe(
      "oeuvres-d-awa",
    );
    expect(slugOf("chez ali")).toBe("chez-ali");
  });

  it("refuse un nom qui reprend « Kemdia », même déguisé", () => {
    for (const name of [
      "Kemdia",
      "Kemdia Officiel",
      "K.e.m.d.i.a Store",
      "KEMDÏA",
      "Ｋｅｍｄｉａ",
      // Relecture de sécurité S6-T01 : lettres « latines » trompeuses et chiffres ressemblants
      "Kemdıa",
      "ᴋᴇᴍᴅɪᴀ Officiel",
      "KEMDlA",
      "Kemd1a",
      "Kemdiɑ",
    ]) {
      expect(code(() => validateApplication({ ...APPLICATION, name }))).toBe("BOUTIQUE_INVALIDE");
    }
  });

  it("refuse les lettres d'autres alphabets (imitation d'un nom) et les caractères spéciaux", () => {
    // « е » cyrillique : ressemble à « Kemdia » mais n'en a pas la clé
    expect(code(() => validateApplication({ ...APPLICATION, name: "Kеmdia" }))).toBe(
      "BOUTIQUE_INVALIDE",
    );
    expect(code(() => validateApplication({ ...APPLICATION, name: "Boutique <b>" }))).toBe(
      "BOUTIQUE_INVALIDE",
    );
    expect(validateApplication({ ...APPLICATION, name: "L'Atelier d'Awa & Fils" }).name).toBe(
      "L'Atelier d'Awa & Fils",
    );
  });

  it("une tabulation compte comme une espace", () => {
    expect(cleanLine("Chez\tAli")).toBe("Chez Ali");
    expect(cleanText("Ligne\tun\nLigne deux")).toBe("Ligne un\nLigne deux");
  });

  it("retire les caractères invisibles", () => {
    expect(cleanLine("Chez​ Ali‮")).toBe("Chez Ali");
    expect(validateApplication({ ...APPLICATION, name: "Ch​ez Ali" }).name).toBe("Chez Ali");
  });

  it("vérifie les longueurs après nettoyage", () => {
    expect(code(() => validateApplication({ ...APPLICATION, name: "  A    " }))).toBe(
      "BOUTIQUE_INVALIDE",
    );
    expect(code(() => validateApplication({ ...APPLICATION, name: "x".repeat(61) }))).toBe(
      "BOUTIQUE_INVALIDE",
    );
    expect(code(() => validateApplication({ ...APPLICATION, name: "!!!---" }))).toBe(
      "BOUTIQUE_INVALIDE",
    );
    expect(code(() => validateApplication({ ...APPLICATION, city: " L " }))).toBe(
      "BOUTIQUE_INVALIDE",
    );
    expect(code(() => validateApplication({ ...APPLICATION, description: "Trop court" }))).toBe(
      "BOUTIQUE_INVALIDE",
    );
    expect(code(() => validateApplication({ ...APPLICATION, description: "é".repeat(501) }))).toBe(
      "BOUTIQUE_INVALIDE",
    );
  });

  it("la ville : lettres, chiffres et ponctuation simple seulement", () => {
    expect(validateApplication({ ...APPLICATION, city: "Port-Gentil" }).city).toBe("Port-Gentil");
    expect(code(() => validateApplication({ ...APPLICATION, city: "<script>" }))).toBe(
      "BOUTIQUE_INVALIDE",
    );
  });

  it("garde les sauts de ligne de la description (deux lignes vides au plus)", () => {
    expect(cleanText("Ligne 1  \r\n\r\n\r\n\r\n  Ligne   2\t")).toBe("Ligne 1\n\nLigne 2");
  });

  it("n'accepte qu'un mobile gabonais", () => {
    for (const phone of ["011 12 34 56", "+33 6 12 34 56 78", "07712345", "abc"]) {
      expect(code(() => validateApplication({ ...APPLICATION, phone }))).toBe("BOUTIQUE_INVALIDE");
    }
    expect(validateApplication({ ...APPLICATION, phone: "+241 62 12 34 56" }).contactPhone).toBe(
      "+241062123456",
    );
  });
});

describe("Décisions de l'administration (S6-T01)", () => {
  const by = (reason: string | null = null) => ({ adminId: ADMIN, reason, now: NOW });

  it("valide une boutique en attente, sans motif", () => {
    const shop = decide(pending(), "approve", by("ignoré"));
    expect(shop).toMatchObject({
      status: "active",
      statusReason: null,
      reviewedBy: ADMIN,
      reviewedAt: NOW,
    });
  });

  it("refuse avec un motif obligatoire, puis le demandeur peut redemander", () => {
    expect(code(() => decide(pending(), "reject", by(null)))).toBe("BOUTIQUE_INVALIDE");
    const rejected = decide(pending(), "reject", by("  Pièce d'identité illisible "));
    expect(rejected).toMatchObject({
      status: "rejected",
      statusReason: "Pièce d'identité illisible",
      // Le nom refusé est libéré pour d'autres demandeurs
      nameKey: null,
    });
    const later = new Date("2026-10-16T08:00:00.000Z");
    const again = resubmit(
      rejected,
      validateApplication({ ...APPLICATION, name: "Chez Ali" }),
      "chez-ali",
      later,
    );
    expect(again).toMatchObject({
      status: "pending",
      statusReason: null,
      name: "Chez Ali",
      nameKey: "chez aii",
      // Nouvelle demande : pas encore examinée
      reviewedBy: null,
      reviewedAt: null,
      submittedAt: later,
    });
  });

  it("suspend une boutique active, puis la réactive", () => {
    const active = decide(pending(), "approve", by());
    const suspended = decide(active, "suspend", by("Produits contrefaits signalés"));
    expect(suspended.status).toBe("suspended");
    expect(decide(suspended, "approve", by()).status).toBe("active");
  });

  it("refuse les décisions hors de l'état prévu", () => {
    const active = decide(pending(), "approve", by());
    expect(code(() => decide(active, "approve", by()))).toBe("STATUT_BOUTIQUE_INCOMPATIBLE");
    expect(code(() => decide(active, "reject", by("Motif suffisant")))).toBe(
      "STATUT_BOUTIQUE_INCOMPATIBLE",
    );
    expect(code(() => decide(pending(), "suspend", by("Motif suffisant")))).toBe(
      "STATUT_BOUTIQUE_INCOMPATIBLE",
    );
  });

  it("une boutique en attente, active ou suspendue ne se redemande pas", () => {
    const app = validateApplication(APPLICATION);
    expect(code(() => resubmit(pending(), app, "x", NOW))).toBe("BOUTIQUE_EXISTE");
    const active = decide(pending(), "approve", by());
    expect(code(() => resubmit(active, app, "x", NOW))).toBe("BOUTIQUE_EXISTE");
  });

  it("personne ne décide pour sa propre boutique (même UUID en majuscules)", () => {
    expect(
      code(() =>
        decide(pending(), "approve", { adminId: OWNER.toUpperCase(), reason: null, now: NOW }),
      ),
    ).toBe("BOUTIQUE_SUR_SOI_INTERDITE");
  });

  it("la boutique Kemdia ne passe par aucune décision", () => {
    const kemdia: Shop = { ...pending(), kind: "kemdia", ownerAccountId: null, status: "active" };
    expect(code(() => decide(kemdia, "suspend", by("Motif suffisant")))).toBe(
      "STATUT_BOUTIQUE_INCOMPATIBLE",
    );
  });

  it("vérifie la longueur du motif", () => {
    expect(code(() => validateReason("  non "))).toBe("BOUTIQUE_INVALIDE");
    expect(code(() => validateReason("x".repeat(301)))).toBe("BOUTIQUE_INVALIDE");
  });
});
