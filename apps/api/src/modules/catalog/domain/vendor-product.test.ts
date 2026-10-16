import { describe, expect, it } from "vitest";
import { Product } from "./product.js";
import {
  cleanLine,
  moderate,
  onArchive,
  onContentChange,
  onCreate,
  onRestore,
  validateContent,
  variantAttributes,
  variantName,
  vendorSlug,
  type ModerationState,
} from "./vendor-product.js";

const NOW = new Date("2026-10-16T08:00:00.000Z");
const LATER = new Date("2026-10-16T09:00:00.000Z");
const MODERATOR = "22222222-2222-4222-8222-222222222222";
const CATEGORY = "33333333-3333-4333-8333-333333333333";

const CONTENT = {
  title: "  Pagne   wax  6 yards ",
  description: "Pagne wax 100 % coton, 6 yards, motifs variés, cousu à Libreville.",
  brand: " ",
  categoryId: CATEGORY.toUpperCase(),
};

const code = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return "aucune erreur";
};

describe("Produits des vendeurs : contenu (S6-T02)", () => {
  it("nettoie le contenu ; marque vide = sans marque ; catégorie en minuscules", () => {
    expect(validateContent(CONTENT)).toEqual({
      title: "Pagne wax 6 yards",
      description: "Pagne wax 100 % coton, 6 yards, motifs variés, cousu à Libreville.",
      brand: null,
      categoryId: CATEGORY,
    });
  });

  it("vérifie les longueurs après nettoyage et retire les caractères invisibles", () => {
    expect(code(() => validateContent({ ...CONTENT, title: "  Pa  " }))).toBe("PRODUIT_INVALIDE");
    expect(code(() => validateContent({ ...CONTENT, description: "Trop court" }))).toBe(
      "PRODUIT_INVALIDE",
    );
    expect(code(() => validateContent({ ...CONTENT, brand: "x" }))).toBe("PRODUIT_INVALIDE");
    expect(cleanLine("Pagne‮ wax​")).toBe("Pagne wax");
  });

  it("variantes : nom nettoyé, caractéristiques en minuscules", () => {
    expect(variantName("  Rouge  ·  M ")).toBe("Rouge · M");
    expect(code(() => variantName("   "))).toBe("PRODUIT_INVALIDE");
    expect(variantAttributes({ " Couleur ": " Rouge " })).toEqual({ couleur: "Rouge" });
  });

  it("adresse lisible : tirée du titre, suffixe au hasard, jamais vide", () => {
    expect(vendorSlug("pagne wax 6 yards", "ab12cd")).toBe("pagne-wax-6-yards-ab12cd");
    expect(vendorSlug("", "ab12cd")).toBe("produit-ab12cd");
  });
});

describe("Produits des vendeurs : modération (S6-T02)", () => {
  const pending = onCreate(NOW);
  const by = (reason: string | null = null) => ({
    moderatorId: MODERATOR,
    reason,
    now: LATER,
    seenSubmittedAt: NOW,
  });

  it("un nouveau produit attend la modération", () => {
    expect(pending).toEqual({
      status: "PENDING",
      moderationReason: null,
      submittedAt: NOW,
      reviewedBy: null,
      reviewedAt: null,
    });
  });

  it("valider : en ligne, sans motif ; refuser : motif obligatoire", () => {
    expect(moderate(pending, "approve", by("ignoré"))).toMatchObject({
      status: "PUBLISHED",
      moderationReason: null,
      reviewedBy: MODERATOR,
      reviewedAt: LATER,
    });
    expect(code(() => moderate(pending, "reject", by()))).toBe("PRODUIT_INVALIDE");
    expect(moderate(pending, "reject", by("  Photos manquantes "))).toMatchObject({
      status: "REJECTED",
      moderationReason: "Photos manquantes",
    });
  });

  it("jamais une version que le modérateur n'a pas lue (contenu renvoyé entre-temps)", () => {
    const resent = onContentChange(pending, LATER);
    expect(code(() => moderate(resent, "approve", by()))).toBe("PRODUIT_MODIFIE");
    expect(moderate(resent, "approve", { ...by(), seenSubmittedAt: LATER }).status).toBe(
      "PUBLISHED",
    );
  });

  it("titres faits de blancs invisibles ou de signes, caractéristiques en double : refusés", () => {
    for (const title of ["ㅤㅤㅤㅤㅤㅤ", "\u2800\u2800\u2800\u2800\u2800", "!!!!!!"]) {
      expect(code(() => validateContent({ ...CONTENT, title }))).toBe("PRODUIT_INVALIDE");
    }
    // Une marque faite seulement de blancs invisibles est retirée : le produit est « sans marque »
    expect(validateContent({ ...CONTENT, brand: "ㅤㅤ" }).brand).toBeNull();
    expect(code(() => validateContent({ ...CONTENT, brand: "ㅤ!!ㅤ" }))).toBe("PRODUIT_INVALIDE");
    expect(code(() => variantAttributes({ Couleur: "Noir", "couleur ": "Rouge" }))).toBe(
      "PRODUIT_INVALIDE",
    );
  });

  it("seul un produit en attente se modère", () => {
    const published = moderate(pending, "approve", by());
    expect(code(() => moderate(published, "approve", by()))).toBe("STATUT_PRODUIT_INCOMPATIBLE");
    expect(code(() => moderate(onArchive(published), "reject", by("Motif valable")))).toBe(
      "STATUT_PRODUIT_INCOMPATIBLE",
    );
  });

  it("contenu modifié : repasse en attente, décision précédente effacée (elle reste au journal)", () => {
    const rejected = moderate(pending, "reject", by("Description vague"));
    const again: ModerationState = onContentChange(rejected, LATER);
    expect(again).toEqual({
      status: "PENDING",
      moderationReason: null,
      submittedAt: LATER,
      reviewedBy: null,
      reviewedAt: null,
    });
    expect(onContentChange(moderate(pending, "approve", by()), LATER).status).toBe("PENDING");
  });

  it("archiver puis remettre en vente : nouvelle modération ; un produit archivé ne se modifie pas", () => {
    const archived = onArchive(moderate(pending, "approve", by()));
    expect(archived.status).toBe("ARCHIVED");
    expect(code(() => onArchive(archived))).toBe("STATUT_PRODUIT_INCOMPATIBLE");
    expect(code(() => onContentChange(archived, LATER))).toBe("STATUT_PRODUIT_INCOMPATIBLE");
    expect(onRestore(archived, LATER)).toMatchObject({ status: "PENDING", submittedAt: LATER });
    expect(code(() => onRestore(pending, LATER))).toBe("STATUT_PRODUIT_INCOMPATIBLE");
  });
});

describe("Visibilité d'un produit (S6-T02)", () => {
  const props = (status: Product["status"], shopSuspended = false) => ({
    id: "44444444-4444-4444-8444-444444444444",
    slug: "pagne-wax",
    title: "Pagne wax",
    description: "",
    brand: null,
    categoryId: CATEGORY,
    images: [],
    status,
    rating: 0,
    reviewCount: 0,
    isFeatured: false,
    isBestseller: false,
    isNew: false,
    shopSuspended,
    variants: [
      {
        id: "55555555-5555-4555-8555-555555555555",
        sku: "VAB12CD34-1",
        name: "Rouge",
        attributes: {},
        price: 5_000,
        compareAtPrice: null,
        stock: 3,
        isActive: true,
      },
    ],
  });

  it("visible et commandable : publié ET boutique non suspendue", () => {
    const variantId = "55555555-5555-4555-8555-555555555555";
    expect(Product.create(props("PUBLISHED")).isVisible).toBe(true);
    for (const status of ["PENDING", "REJECTED", "ARCHIVED", "DRAFT"] as const) {
      const product = Product.create(props(status));
      expect(product.isVisible).toBe(false);
      expect(product.checkOrderable(variantId, 1)).toMatchObject({ ok: false });
    }
    const suspended = Product.create(props("PUBLISHED", true));
    expect(suspended.isVisible).toBe(false);
    expect(suspended.isAvailable).toBe(false);
    expect(suspended.checkOrderable(variantId, 1)).toEqual({
      ok: false,
      reason: "PRODUIT_INDISPONIBLE",
    });
  });
});
