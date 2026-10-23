import { describe, expect, it } from "vitest";
import { AVATAR_COLORS, avatarColorOf, avatarSrc, initialsOf } from "./avatar";

/** Contraste du blanc sur une couleur (WCAG 2.1). */
function contrastWithWhite(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * lin(r!) + 0.7152 * lin(g!) + 0.0722 * lin(b!);
  return 1.05 / (l + 0.05);
}

describe("photo de profil : initiales et adresse (S7.5-T08)", () => {
  it("initiales du prénom et du nom, accents gardés", () => {
    expect(initialsOf("awa", "ndong")).toBe("AN");
    expect(initialsOf("Émile", "  Obiang")).toBe("ÉO");
    expect(initialsOf("", "")).toBe("?");
  });

  it("couleur stable et toujours lisible en blanc", () => {
    expect(avatarColorOf("Awa", "Ndong")).toBe(avatarColorOf("AWA", "NDONG"));
    for (const color of AVATAR_COLORS) expect(contrastWithWhite(color)).toBeGreaterThanOrEqual(4.5);
  });

  it("adresse seulement pour une version bien formée", () => {
    expect(avatarSrc("0123456789abcdef")).toBe("/compte/photo?v=0123456789abcdef");
    expect(avatarSrc(null)).toBeNull();
    expect(avatarSrc("../../x")).toBeNull();
  });
});
