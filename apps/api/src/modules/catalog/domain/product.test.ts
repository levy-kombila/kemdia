import { describe, expect, it } from "vitest";
import { CatalogError } from "./catalog-error.js";
import { MAX_ORDER_QUANTITY, Product } from "./product.js";
import { ids, productProps, variantProps } from "../../../../test/catalog/fixtures.js";

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof CatalogError) return error.code;
    throw error;
  }
  return "AUCUNE_ERREUR";
};

const twoVariants = Product.create(
  productProps({
    variants: [
      variantProps({
        id: ids.v1,
        sku: "KMD-TEL-NOIR",
        price: 150_000,
        compareAtPrice: 180_000,
        stock: 0,
      }),
      variantProps({
        id: ids.v2,
        sku: "KMD-TEL-BLEU",
        name: "Bleu",
        attributes: { couleur: "Bleu" },
        price: 140_000,
        stock: 3,
      }),
    ],
  }),
);

describe("Product — création", () => {
  it("accepte un produit valide et nettoie les textes", () => {
    const product = Product.create(productProps({ title: "  Téléphone   Kemdia " }));
    expect(product.title).toBe("Téléphone Kemdia");
    expect(Object.isFrozen(product.variants[0])).toBe(true);
  });

  it("BR-042 : refuse un identifiant qui n'est pas un UUID", () => {
    expect(code(() => Product.create(productProps({ id: "42" })))).toBe("IDENTIFIANT_INVALIDE");
  });

  it("BR-004 : prix en FCFA entiers et positifs", () => {
    for (const price of [0, -1, 1500.5, Number.NaN, 200_000_000]) {
      expect(
        code(() => Product.create(productProps({ variants: [variantProps({ price })] }))),
      ).toBe("PRIX_INVALIDE");
    }
  });

  it("prix barré forcément supérieur au prix", () => {
    expect(
      code(() =>
        Product.create(
          productProps({ variants: [variantProps({ price: 10_000, compareAtPrice: 10_000 })] }),
        ),
      ),
    ).toBe("VARIANTE_INVALIDE");
  });

  it("stock entier, jamais négatif", () => {
    expect(
      code(() => Product.create(productProps({ variants: [variantProps({ stock: -1 })] }))),
    ).toBe("STOCK_INVALIDE");
    expect(
      code(() => Product.create(productProps({ variants: [variantProps({ stock: 1.5 })] }))),
    ).toBe("STOCK_INVALIDE");
  });

  it("au moins une variante, sans doublon de référence", () => {
    expect(code(() => Product.create(productProps({ variants: [] })))).toBe("PRODUIT_INVALIDE");
    expect(
      code(() =>
        Product.create(productProps({ variants: [variantProps(), variantProps({ id: ids.v2 })] })),
      ),
    ).toBe("PRODUIT_INVALIDE");
  });

  it("un produit publié a au moins une variante active", () => {
    expect(
      code(() => Product.create(productProps({ variants: [variantProps({ isActive: false })] }))),
    ).toBe("PRODUIT_INVALIDE");
    expect(
      code(() =>
        Product.create(
          productProps({ status: "DRAFT", variants: [variantProps({ isActive: false })] }),
        ),
      ),
    ).toBe("AUCUNE_ERREUR");
  });

  it("images : uniquement des chemins du site (aucune adresse externe)", () => {
    for (const image of [
      "https://evil.example/x.webp",
      "/images/../../etc/passwd.png",
      "/autre/x.webp",
    ]) {
      expect(code(() => Product.create(productProps({ images: [image] })))).toBe(
        "PRODUIT_INVALIDE",
      );
    }
  });

  it("adresse (slug) et référence (SKU) au bon format", () => {
    expect(code(() => Product.create(productProps({ slug: "Téléphone Kemdia" })))).toBe(
      "SLUG_INVALIDE",
    );
    expect(
      code(() => Product.create(productProps({ variants: [variantProps({ sku: "kmd tel" })] }))),
    ).toBe("VARIANTE_INVALIDE");
  });

  it("note entre 0 et 5, arrondie au dixième", () => {
    expect(code(() => Product.create(productProps({ rating: 5.1 })))).toBe("PRODUIT_INVALIDE");
    expect(Product.create(productProps({ rating: 4.26 })).rating).toBe(4.3);
  });
});

describe("Product — prix et stock (FR-013)", () => {
  it("prix affiché = variante active la moins chère", () => {
    expect(twoVariants.price).toBe(140_000);
    expect(twoVariants.mainVariant.sku).toBe("KMD-TEL-BLEU");
    expect(twoVariants.compareAtPrice).toBeNull();
  });

  it("chaque variante a son propre stock ; le total ne compte que les actives", () => {
    expect(twoVariants.totalStock).toBe(3);
    expect(twoVariants.isAvailable).toBe(true);
  });

  it("texte de recherche sans accents, avec la catégorie et les caractéristiques", () => {
    expect(twoVariants.searchText("Téléphones portables")).toBe(
      "telephone kemdia kemdia telephones portables noir bleu",
    );
  });
});

describe("Product — BR-001 : on ne commande pas un produit indisponible", () => {
  it("variante en stock : commandable", () => {
    expect(twoVariants.checkOrderable(ids.v2, 3)).toEqual({ ok: true });
  });

  it("variante à stock nul : indisponible, même si une autre variante a du stock", () => {
    expect(twoVariants.checkOrderable(ids.v1, 1)).toEqual({
      ok: false,
      reason: "PRODUIT_INDISPONIBLE",
    });
  });

  it("quantité supérieure au stock : indique la quantité disponible", () => {
    expect(twoVariants.checkOrderable(ids.v2, 4)).toEqual({
      ok: false,
      reason: "STOCK_INSUFFISANT",
      available: 3,
    });
  });

  it("produit brouillon ou archivé : indisponible", () => {
    for (const status of ["DRAFT", "ARCHIVED"] as const) {
      const product = Product.create(productProps({ status }));
      expect(product.isAvailable).toBe(false);
      expect(product.checkOrderable(ids.v1, 1)).toEqual({
        ok: false,
        reason: "PRODUIT_INDISPONIBLE",
      });
    }
  });

  it("variante désactivée ou inconnue", () => {
    const product = Product.create(
      productProps({
        variants: [variantProps(), variantProps({ id: ids.v2, sku: "KMD-OFF", isActive: false })],
      }),
    );
    expect(product.checkOrderable(ids.v2, 1)).toEqual({
      ok: false,
      reason: "PRODUIT_INDISPONIBLE",
    });
    expect(product.checkOrderable(ids.category, 1)).toEqual({
      ok: false,
      reason: "VARIANTE_INCONNUE",
    });
  });

  it("quantité invalide", () => {
    for (const quantity of [0, -1, 1.5, MAX_ORDER_QUANTITY + 1]) {
      expect(twoVariants.checkOrderable(ids.v2, quantity)).toEqual({
        ok: false,
        reason: "QUANTITE_INVALIDE",
      });
    }
  });
});
