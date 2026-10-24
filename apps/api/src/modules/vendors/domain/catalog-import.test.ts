import { describe, expect, it } from "vitest";
import { parseCatalogImport, splitCsv, type ImportRules } from "./catalog-import.js";

const RULES: ImportRules = {
  maxRows: 5,
  referenceMax: 40,
  errorsMax: 100,
  titleMin: 5,
  titleMax: 120,
  descriptionMin: 30,
  descriptionMax: 5000,
  brandMin: 2,
  brandMax: 60,
  variantNameMax: 80,
  variantsMax: 3,
  priceMax: 100_000_000,
  stockMax: 1_000_000,
};
const HEAD = "boutique;reference;titre;description;marque;categorie;variante;prix;prix_barre;stock";
const DESC = "Pagne wax 100 % coton, 6 yards, motifs garantis grand teint.";
const row = (cells: Partial<Record<string, string>> = {}) =>
  [
    cells.boutique ?? "kemdia",
    cells.reference ?? "WAX-001",
    cells.titre ?? "Pagne wax Fleurs",
    cells.description ?? DESC,
    cells.marque ?? "Vlisco",
    cells.categorie ?? "pagnes",
    cells.variante ?? "Rouge",
    cells.prix ?? "15 000",
    cells.prix_barre ?? "",
    cells.stock ?? "12",
  ].join(";");

describe("CSV (S8-T03)", () => {
  it("devine le séparateur, gère les guillemets, les retours à la ligne et le BOM", () => {
    expect(splitCsv('﻿a;b\r\n"x;1";"dit ""oui""\nfin"\r\n\r\n')).toEqual([
      ["a", "b"],
      ["x;1", 'dit "oui"\nfin'],
    ]);
    expect(splitCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
    expect(splitCsv('a;b\n"jamais fermé;2')).toBeNull();
  });
});

describe("Import du catalogue : vérification des lignes (S8-T03)", () => {
  it("regroupe les variantes d'une même boutique et référence ; en-têtes sans accents ni casse", () => {
    const text = [
      "Boutique;Référence;Titre;Description;Marque;Catégorie;Variante;Prix;Prix barré;Stock",
      row(),
      row({ variante: "Bleu", prix: "15.000", prix_barre: "18 000" }),
      row({ reference: "WAX-002", variante: "" }),
    ].join("\n");
    const parsed = parseCatalogImport(text, RULES);
    expect(parsed.issues).toEqual([]);
    expect(parsed.products).toHaveLength(2);
    expect(parsed.products[0]).toMatchObject({
      line: 2,
      shop: "kemdia",
      reference: "WAX-001",
      brand: "Vlisco",
      category: "pagnes",
      variants: [
        { line: 2, name: "Rouge", price: 15000, compareAtPrice: null, stock: 12 },
        { line: 3, name: "Bleu", price: 15000, compareAtPrice: 18000, stock: 12 },
      ],
    });
  });

  it("collecte TOUTES les erreurs, avec la ligne et la colonne", () => {
    const text = [
      HEAD,
      row({ boutique: "Boutique Awa", prix: "15,5", stock: "-2" }),
      row({ reference: "", titre: "abc", prix_barre: "100" }),
    ].join("\n");
    const parsed = parseCatalogImport(text, RULES);
    expect(parsed.products).toEqual([]);
    expect(parsed.issues.map((i) => `${i.line}:${i.column}`)).toEqual([
      "2:boutique",
      "2:prix",
      "2:stock",
      "3:reference",
      "3:titre",
      "3:prix_barre",
    ]);
  });

  it("refuse les colonnes manquantes ou inconnues, un fichier trop long, les caractères interdits", () => {
    expect(
      parseCatalogImport("boutique;reference;couleur\nx;y;z", RULES).issues[0]?.message,
    ).toMatch(/inconnue/);
    expect(
      parseCatalogImport("boutique;reference\nkemdia;A", RULES).issues.map((i) => i.column),
    ).toEqual(["titre", "description", "categorie", "prix", "stock"]);
    const long = [HEAD, ...Array.from({ length: 6 }, (_, i) => row({ reference: `R${i}` }))].join(
      "\n",
    );
    expect(parseCatalogImport(long, RULES).issues[0]?.message).toMatch(/5 au plus/);
    expect(
      parseCatalogImport([HEAD, row({ titre: "Pagne ‮ wax" })].join("\n"), RULES).issues[0],
    ).toMatchObject({
      column: "titre",
    });
  });

  it("même référence : même fiche obligatoire, variantes distinctes et nommées, pas trop nombreuses", () => {
    const differing = [HEAD, row(), row({ variante: "Bleu", titre: "Autre titre" })].join("\n");
    expect(parseCatalogImport(differing, RULES).issues[0]?.message).toMatch(/ligne 2/);
    const duplicate = [HEAD, row(), row()].join("\n");
    expect(parseCatalogImport(duplicate, RULES).issues[0]?.message).toMatch(/double/);
    const unnamed = [HEAD, row(), row({ variante: "" })].join("\n");
    expect(parseCatalogImport(unnamed, RULES).issues[0]?.message).toMatch(/nom obligatoire/);
    const many = [HEAD, ...["A", "B", "C", "D"].map((v) => row({ variante: v }))].join("\n");
    expect(parseCatalogImport(many, RULES).issues[0]?.message).toMatch(/3 variantes au plus/);
  });
});
