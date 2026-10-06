import { describe, expect, it } from "vitest";
import { CatalogError } from "./catalog-error.js";
import { CategoryTree, MAX_CATEGORY_DEPTH, createCategory, type Category } from "./category.js";

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const cat = (slug: string, parentId: string | null = null, position = 0): Category =>
  createCategory({ id: uuid(), slug, name: slug, parentId, icon: "tag", image: null, position });

describe("Catégories", () => {
  const mode = cat("mode");
  const sport = cat("sport", mode.id, 2);
  const homme = cat("homme", mode.id, 1);
  const fitness = cat("fitness", sport.id);
  const yoga = cat("yoga", fitness.id);
  const tech = cat("high-tech");
  const tree = new CategoryTree([yoga, fitness, sport, homme, mode, tech]);

  it("construit l'arborescence, enfants triés par position", () => {
    expect(tree.roots.map((r) => r.slug).sort()).toEqual(["high-tech", "mode"]);
    expect(tree.children(mode.id).map((c) => c.slug)).toEqual(["homme", "sport"]);
    expect(tree.roots.find((r) => r.slug === "mode")?.children[1]?.children[0]?.depth).toBe(3);
  });

  it("fil d'Ariane et descendants", () => {
    expect(tree.path(yoga.id).map((c) => c.slug)).toEqual(["mode", "sport", "fitness", "yoga"]);
    expect(tree.descendantIds(sport.id).sort()).toEqual([sport.id, fitness.id, yoga.id].sort());
    expect(tree.descendantIds("inconnue")).toEqual([]);
  });

  it(`refuse plus de ${MAX_CATEGORY_DEPTH} niveaux`, () => {
    const tooDeep = cat("trop-profond", yoga.id);
    expect(() => new CategoryTree([mode, sport, fitness, yoga, tooDeep])).toThrow(/4 niveaux/);
  });

  it("refuse une boucle, un parent inconnu, une adresse en double", () => {
    const a = createCategory({
      id: uuid(),
      slug: "a",
      name: "A",
      parentId: null,
      icon: "tag",
      image: null,
      position: 0,
    });
    const b = createCategory({
      id: uuid(),
      slug: "b",
      name: "B",
      parentId: a.id,
      icon: "tag",
      image: null,
      position: 0,
    });
    const loopA = { ...a, parentId: b.id };
    expect(() => new CategoryTree([loopA, b])).toThrow(/propre ancêtre/);
    expect(() => new CategoryTree([cat("orpheline", uuid())])).toThrow(/parente introuvable/);
    expect(() => new CategoryTree([cat("double"), cat("double")])).toThrow(CatalogError);
  });

  it("valide les champs à la création", () => {
    expect(() => cat("Pas Un Slug")).toThrow(CatalogError);
    expect(() =>
      createCategory({
        id: uuid(),
        slug: "x",
        name: "X",
        parentId: null,
        icon: "<svg>",
        image: null,
        position: 0,
      }),
    ).toThrow(/icône/);
    expect(() =>
      createCategory({
        id: uuid(),
        slug: "x",
        name: "X",
        parentId: null,
        icon: "tag",
        image: "http://x/y.png",
        position: 0,
      }),
    ).toThrow(/image/);
  });
});
