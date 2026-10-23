import { describe, expect, it } from "vitest";
import { allowedTypos, closestWord, editDistance } from "./spelling.js";

describe("correction des fautes de frappe (S7.5-T06)", () => {
  it("distance d'édition : une inversion de lettres compte pour une faute", () => {
    expect(editDistance("iphone", "iphone")).toBe(0);
    expect(editDistance("ipohne", "iphone")).toBe(1);
    expect(editDistance("ecuteurs", "ecouteurs")).toBe(1);
    expect(editDistance("chat", "chien")).toBe(3);
    // Arrêt anticipé : au-delà du maximum, on renvoie max + 1
    expect(editDistance("abcdef", "uvwxyz", 2)).toBe(3);
    expect(editDistance("a", "abcdefgh", 2)).toBe(3);
  });

  it("fautes tolérées selon la longueur du mot", () => {
    expect([3, 4, 5, 7, 8, 20].map(allowedTypos)).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it("mot le plus proche, le mot lui-même s'il existe, rien si trop éloigné", () => {
    expect(closestWord("ipohne", ["telephone", "iphone", "phone"])).toBe("iphone");
    // Déjà présent (ou début d'un mot) : inchangé
    expect(closestWord("sams", ["samsung", "sams"])).toBe("sams");
    expect(closestWord("sams", ["samsung"])).toBe("sams");
    // Trop court pour être corrigé
    expect(closestWord("tv", ["tz"])).toBeNull();
    // Trop éloigné
    expect(closestWord("xqzwvk", ["ecouteurs", "beats"])).toBeNull();
    // À égalité, le premier (le plus ressemblant selon la base)
    expect(closestWord("bota", ["bot", "botte"])).toBe("bot");
    expect(closestWord("x".repeat(31), ["x".repeat(30)])).toBeNull();
  });
});
