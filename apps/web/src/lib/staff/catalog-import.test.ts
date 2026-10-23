import { describe, expect, it } from "vitest";
import { decodeCatalogFile, isImportMode } from "./catalog-import";

describe("Fichier du catalogue (S8-T03)", () => {
  it("UTF-8 tel quel ; sinon Windows-1252 (Excel en français), accents compris", () => {
    expect(decodeCatalogFile(new TextEncoder().encode("prix;catégorie"))).toBe("prix;catégorie");
    // « catégorie » en Windows-1252 : é = 0xE9 (invalide en UTF-8)
    const ansi = Uint8Array.from([0x63, 0x61, 0x74, 0xe9, 0x67, 0x6f, 0x72, 0x69, 0x65]);
    expect(decodeCatalogFile(ansi)).toBe("catégorie");
  });

  it("refuse un fichier vide, binaire ou trop gros ; actions connues seulement", () => {
    expect(decodeCatalogFile(new Uint8Array())).toBeNull();
    expect(decodeCatalogFile(Uint8Array.from([0x50, 0x4b, 0x00, 0x03]))).toBeNull();
    expect(decodeCatalogFile(new Uint8Array(2 * 1024 * 1024 + 1).fill(0x61))).toBeNull();
    expect(isImportMode("check")).toBe(true);
    expect(isImportMode("supprimer")).toBe(false);
  });
});
