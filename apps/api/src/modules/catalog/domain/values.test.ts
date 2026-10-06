import { describe, expect, it } from "vitest";
import { searchable } from "./values.js";

describe("searchable", () => {
  it("minuscules, sans accents ni ponctuation", () => {
    expect(searchable("  Écouteurs Bluetooth — ÉDITION « Noël » ")).toBe(
      "ecouteurs bluetooth edition noel",
    );
  });

  it("aucun caractère spécial ne passe (jokers SQL, guillemets)", () => {
    expect(searchable("%_' OR 1=1; --")).toBe("or 1 1");
  });
});
