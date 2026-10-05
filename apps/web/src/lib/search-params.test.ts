import { describe, expect, it } from "vitest";
import {
  MAX_QUERY_LENGTH,
  first,
  parsePage,
  parseQuery,
  parseReturnTo,
  parseSort,
} from "./search-params";

describe("parseSort (liste blanche — leçon MED-13)", () => {
  it("accepte les valeurs connues", () => {
    expect(parseSort("prix-asc")).toBe("prix-asc");
    expect(parseSort("note")).toBe("note");
  });
  it("rejette toute autre valeur, y compris des tentatives d'injection", () => {
    expect(parseSort("-password")).toBe("pertinence");
    expect(parseSort("__proto__")).toBe("pertinence");
    expect(parseSort("constructor")).toBe("pertinence");
    expect(parseSort(undefined)).toBe("pertinence");
    expect(parseSort(["prix-asc"])).toBe("pertinence");
  });
});

describe("parsePage", () => {
  it("borne les valeurs", () => {
    expect(parsePage("3")).toBe(3);
    expect(parsePage("0")).toBe(1);
    expect(parsePage("-5")).toBe(1);
    expect(parsePage("abc")).toBe(1);
    expect(parsePage("999999999")).toBe(1000);
  });
});

describe("parseQuery / first", () => {
  it("coupe et limite la longueur", () => {
    expect(parseQuery("  vélo  ")).toBe("vélo");
    expect(parseQuery("x".repeat(500))).toHaveLength(MAX_QUERY_LENGTH);
    expect(parseQuery(42)).toBe("");
  });
  it("prend la première valeur d'un tableau", () => {
    expect(first(["a", "b"])).toBe("a");
    expect(first("a")).toBe("a");
    expect(first(undefined)).toBeUndefined();
  });
});

describe("parseReturnTo", () => {
  it("garde un chemin interne", () => {
    expect(parseReturnTo("/panier")).toBe("/panier");
    expect(parseReturnTo("/produit/casque?x=1")).toBe("/produit/casque?x=1");
  });
  it.each([
    undefined,
    "",
    "https://pirate.com",
    "//pirate.com",
    "/\\pirate.com",
    "javascript:alert(1)",
    "/a\nb",
  ])("refuse %s (redirection ouverte)", (value) => expect(parseReturnTo(value)).toBe("/compte"));
});
