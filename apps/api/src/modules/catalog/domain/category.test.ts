import { describe, expect, it } from "vitest";
import { CatalogError } from "./catalog-error.js";
import { CategoryTree, MAX_CATEGORY_DEPTH, createCategory, type Category } from "./category.js";

let n = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const cat = (slug: string, parentId: string | null = null, position = 0): Category =>
  createCategory({ id: uuid(), slug, name: slug, parentId, icon: "tag", image: null, position });

describe("Catégories", () => {
  // Sport & Loisirs › Fitness › Yoga : 3 niveaux (BR-005)
  const loisirs = cat("sport-loisirs");
  const fitness = cat("sport-fitness", loisirs.id, 2);
  const camping = cat("sport-loisirs-camping", loisirs.id, 1);
  const yoga = cat("fitness-yoga", fitness.id);
  const tech = cat("high-tech");
  const tree = new CategoryTree([yoga, fitness, camping, loisirs, tech]);

  it("construit l'arborescence, enfants triés par position", () => {
    expect(tree.roots.map((r) => r.slug).sort()).toEqual(["high-tech", "sport-loisirs"]);
    expect(tree.children(loisirs.id).map((c) => c.slug)).toEqual([
      "sport-loisirs-camping",
      "sport-fitness",
    ]);
    expect(
      tree.roots.find((r) => r.slug === "sport-loisirs")?.children[1]?.children[0]?.depth,
    ).toBe(3);
  });

  it("fil d'Ariane et descendants", () => {
    expect(tree.path(yoga.id).map((c) => c.slug)).toEqual([
      "sport-loisirs",
      "sport-fitness",
      "fitness-yoga",
    ]);
    expect(tree.descendantIds(loisirs.id).sort()).toEqual(
      [loisirs.id, camping.id, fitness.id, yoga.id].sort(),
    );
    expect(tree.descendantIds("inconnue")).toEqual([]);
  });

  it(`BR-005 : ${MAX_CATEGORY_DEPTH} niveaux au plus`, () => {
    expect(MAX_CATEGORY_DEPTH).toBe(3);
    const tooDeep = cat("trop-profond", yoga.id);
    expect(() => new CategoryTree([loisirs, fitness, yoga, tooDeep])).toThrow(/3 niveaux/);
    // L'ancien classement (Mode › Sport › Fitness › Yoga) est désormais refusé
    const mode = cat("mode");
    const sport = cat("mode-sport", mode.id);
    const oldFitness = cat("ancien-fitness", sport.id);
    expect(
      () => new CategoryTree([mode, sport, oldFitness, cat("ancien-yoga", oldFitness.id)]),
    ).toThrow(CatalogError);
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
