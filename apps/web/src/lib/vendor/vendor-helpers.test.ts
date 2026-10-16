import { describe, expect, it } from "vitest";
import { categoryLabel, categoryOptions } from "./categories";
import { checkContent, checkShopRequest, checkVariants, parseAmount } from "./forms";
import { photoIdOf, sniffUploadType, vendorPhotoSrc } from "./images";
import { vendorErrorFromParam, vendorErrorMessage, vendorNotice } from "./messages";
import { vendorPath } from "./paths";

const PRODUCT = "22222222-2222-4222-8222-222222222222";
const IMAGE = "33333333-3333-4333-8333-333333333333";
const CATEGORY = "55555555-5555-4555-8555-555555555555";

describe("demande de boutique", () => {
  it("nettoie et normalise le mobile gabonais", () => {
    expect(
      checkShopRequest({
        name: "  Couture   Nzé ",
        city: " Oyem",
        phone: "077 98 76 54",
        description: "Robes et chemises cousues à la main.",
      }),
    ).toEqual({
      ok: true,
      value: {
        name: "Couture Nzé",
        city: "Oyem",
        phone: "+241077987654",
        description: "Robes et chemises cousues à la main.",
      },
    });
  });

  it("signale chaque champ mal rempli ; refuse ce qui n'est pas du texte", () => {
    const result = checkShopRequest({
      name: "ab",
      city: "",
      phone: "01 23 45 67",
      description: "court",
    });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(Object.keys(result.errors).sort()).toEqual(["city", "description", "name", "phone"]);
    expect(checkShopRequest(null).ok).toBe(false);
    expect(checkShopRequest({ name: ["x"], city: 4 }).ok).toBe(false);
  });
});

describe("produit", () => {
  it("montants : espaces acceptés, entier positif seulement", () => {
    expect(parseAmount("15 000")).toBe(15000);
    expect(parseAmount("15 000")).toBe(15000);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("12,5")).toBeNaN();
    // Point : séparateur de milliers seulement (jamais une virgule déguisée)
    expect(parseAmount("12.500")).toBe(12500);
    expect(parseAmount("1.250.000")).toBe(1250000);
    expect(parseAmount("12.50")).toBeNaN();
    expect(parseAmount("9.5")).toBeNaN();
    expect(parseAmount("-3")).toBeNaN();
    expect(parseAmount("1e6")).toBeNaN();
    expect(parseAmount("999999999")).toBeNaN();
    expect(parseAmount(42)).toBeNaN();
  });

  it("fiche : marque facultative, catégorie = UUID", () => {
    const ok = checkContent({
      title: "Chemise en pagne",
      description: "Chemise homme en pagne wax, coton, coupe droite.",
      brand: "  ",
      categoryId: CATEGORY,
    });
    expect(ok).toMatchObject({ ok: true, value: { brand: null, categoryId: CATEGORY } });
    const bad = checkContent({
      title: "abc",
      description: "court",
      brand: "x",
      categoryId: "mode",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok)
      expect(Object.keys(bad.errors).sort()).toEqual([
        "brand",
        "categoryId",
        "description",
        "title",
      ]);
  });

  it("variantes : nom par défaut, prix barré plus élevé, 1 à 20", () => {
    expect(checkVariants([{ name: "", price: "5000", compareAtPrice: "", stock: "3" }])).toEqual({
      ok: true,
      value: [{ name: "Unique", price: 5000, compareAtPrice: null, stock: 3 }],
    });
    const bad = checkVariants([{ name: "M", price: "5000", compareAtPrice: "4000", stock: "x" }]);
    expect(bad).toMatchObject({
      ok: false,
      errors: { variants: [{ compareAtPrice: expect.any(String), stock: expect.any(String) }] },
    });
    expect(checkVariants([]).ok).toBe(false);
    expect(checkVariants(Array.from({ length: 21 }, () => ({}))).ok).toBe(false);
    expect(checkVariants("pas une liste").ok).toBe(false);
  });
});

describe("photos", () => {
  const bytes = (...values: number[]) => new Uint8Array(values);
  it("type lu dans les premiers octets, jamais dans le nom", () => {
    expect(sniffUploadType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffUploadType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe(
      "image/png",
    );
    expect(sniffUploadType(new TextEncoder().encode("RIFF....WEBPVP8 "))).toBe("image/webp");
    expect(
      sniffUploadType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>")),
    ).toBeNull();
    expect(sniffUploadType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffUploadType(bytes())).toBeNull();
  });

  it("aperçu : relais de l'espace vendeur, jamais l'adresse publique", () => {
    expect(vendorPhotoSrc(PRODUCT, `/images/v/${IMAGE}.webp`)).toBe(
      `/vendeur/produits/${PRODUCT}/photos/${IMAGE}`,
    );
    expect(vendorPhotoSrc("../equipe", `/images/v/${IMAGE}.webp`)).toBeNull();
    expect(vendorPhotoSrc(PRODUCT, "/images/products/x.webp")).toBeNull();
    expect(photoIdOf(`/images/v/${IMAGE}.webp`)).toBe(IMAGE);
    expect(photoIdOf("https://pirate.example/x.webp")).toBeNull();
  });
});

describe("adresse de retour", () => {
  it.each([
    ["/vendeur", "/vendeur"],
    ["/vendeur/produits?statut=pending", "/vendeur/produits?statut=pending"],
    [`/vendeur/produits/${PRODUCT}`, `/vendeur/produits/${PRODUCT}`],
    ["/equipe", "/vendeur"],
    ["//pirate.example/vendeur", "/vendeur"],
    ["/vendeur/../compte", "/vendeur"],
    ["/vendeur?retour=https://pirate.example", "/vendeur"],
    [42, "/vendeur"],
  ])("%s → %s", (value, expected) => {
    expect(vendorPath(value)).toBe(expected);
  });
});

describe("messages", () => {
  it("explication de l'API ajoutée au message ; rôle retiré = boutique inactive", () => {
    expect(vendorErrorMessage("PRODUIT_INVALIDE", "titre : 5 à 120 caractères")).toBe(
      "Vérifiez les champs du produit. (titre : 5 à 120 caractères)",
    );
    expect(vendorErrorMessage("ACCES_REFUSE")).toMatch(/pas active/);
  });

  it("adresse : seulement des codes connus et des avis de la liste", () => {
    expect(vendorErrorFromParam("STOCK_MODIFIE")).toMatch(/stock à jour/);
    expect(vendorErrorFromParam("toString")).toBeNull();
    expect(vendorErrorFromParam("<b>")).toBeNull();
    expect(vendorNotice("photo-ajoutee")).toMatch(/modération/);
    expect(vendorNotice("__proto__")).toBeNull();
  });
});

describe("catégories proposées", () => {
  const node = (id: string, name: string, children: unknown[] = []) =>
    ({ id, name, slug: id, parentId: null, icon: "tag", image: null, children }) as never;
  const tree = [node("a", "Mode", [node("b", "Pagnes", [node("c", "Wax")])]), node("d", "Beauté")];

  it("toutes, rangées par catégorie principale, avec leur chemin", () => {
    expect(categoryOptions(tree)).toEqual([
      { id: "a", label: "Mode", group: "Mode" },
      { id: "b", label: "Pagnes", group: "Mode" },
      { id: "c", label: "Pagnes › Wax", group: "Mode" },
      { id: "d", label: "Beauté", group: "Beauté" },
    ]);
    expect(categoryLabel(tree, "c")).toBe("Mode › Pagnes › Wax");
    expect(categoryLabel(tree, "z")).toBeNull();
  });
});
