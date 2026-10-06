import { CatalogError } from "./catalog-error.js";
import { assertSlug, assertUuid, requiredText } from "./values.js";

/**
 * Profondeur maximale de l'arborescence. Le cahier (F1) parle de 3 niveaux, mais le catalogue de démonstration
 * en compte 4 (Mode › Sport › Fitness › Yoga…) : la règle est fixée à 4 en attendant la décision de l'équipe.
 */
export const MAX_CATEGORY_DEPTH = 4;

export interface CategoryProps {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  /** Nom d'icône (convention du site, résolu par <CategoryIcon/>). */
  icon: string;
  image: string | null;
  position: number;
}

export type Category = Readonly<CategoryProps>;

export function createCategory(props: CategoryProps): Category {
  return Object.freeze({
    id: assertUuid(props.id, "catégorie"),
    slug: assertSlug(props.slug),
    name: requiredText(props.name, "nom de la catégorie", 80),
    parentId: props.parentId === null ? null : assertUuid(props.parentId, "catégorie parente"),
    icon: /^[a-z0-9-]{1,40}$/.test(props.icon)
      ? props.icon
      : fail("CATEGORIE_INVALIDE", "icône : minuscules, chiffres et tirets"),
    image: props.image === null ? null : imagePath(props.image),
    position: Number.isSafeInteger(props.position)
      ? props.position
      : fail("CATEGORIE_INVALIDE", "position : entier"),
  });
}

/** Images servies par le site lui-même (`/images/…`) : jamais d'adresse externe (leçon SSRF HIGH-03). */
export function imagePath(value: string): string {
  if (!/^\/images\/[a-z0-9/_.-]+\.(webp|avif|jpg|jpeg|png)$/.test(value) || value.includes("..")) {
    throw new CatalogError(
      "PRODUIT_INVALIDE",
      `image « ${value.slice(0, 80)} » : chemin /images/… attendu`,
    );
  }
  return value;
}

function fail(code: "CATEGORIE_INVALIDE", message: string): never {
  throw new CatalogError(code, message);
}

export interface CategoryNode extends Category {
  readonly depth: number;
  readonly children: readonly CategoryNode[];
}

/**
 * Arborescence des catégories : construite une fois, vérifiée (parents existants, pas de boucle,
 * profondeur ≤ MAX_CATEGORY_DEPTH, adresses uniques), puis interrogée sans accès à la base.
 */
export class CategoryTree {
  private readonly byId: ReadonlyMap<string, Category>;
  private readonly bySlug: ReadonlyMap<string, Category>;
  private readonly childrenOf: ReadonlyMap<string | null, readonly Category[]>;
  readonly roots: readonly CategoryNode[];

  constructor(categories: readonly Category[]) {
    const byId = new Map<string, Category>();
    const bySlug = new Map<string, Category>();
    const childrenOf = new Map<string | null, Category[]>();
    for (const category of categories) {
      if (byId.has(category.id)) throw tree(`identifiant en double : ${category.id}`);
      if (bySlug.has(category.slug)) throw tree(`adresse en double : ${category.slug}`);
      byId.set(category.id, category);
      bySlug.set(category.slug, category);
    }
    for (const category of categories) {
      if (category.parentId !== null && !byId.has(category.parentId)) {
        throw tree(`« ${category.slug} » : catégorie parente introuvable`);
      }
      const siblings = childrenOf.get(category.parentId) ?? [];
      siblings.push(category);
      childrenOf.set(category.parentId, siblings);
    }
    for (const siblings of childrenOf.values()) {
      siblings.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, "fr"));
    }
    this.byId = byId;
    this.bySlug = bySlug;
    this.childrenOf = childrenOf;

    const visited = new Set<string>();
    const build = (category: Category, depth: number): CategoryNode => {
      if (depth > MAX_CATEGORY_DEPTH) {
        throw tree(`« ${category.slug} » : ${MAX_CATEGORY_DEPTH} niveaux au plus`);
      }
      visited.add(category.id);
      const children = (childrenOf.get(category.id) ?? []).map((c) => build(c, depth + 1));
      return Object.freeze({ ...category, depth, children: Object.freeze(children) });
    };
    this.roots = Object.freeze((childrenOf.get(null) ?? []).map((c) => build(c, 1)));
    // Une catégorie non atteinte depuis une racine fait partie d'une boucle (A parent de B parent de A)
    if (visited.size !== categories.length) {
      const looped = categories.find((c) => !visited.has(c.id));
      throw tree(`« ${looped?.slug} » : la catégorie est sa propre ancêtre`);
    }
  }

  get size(): number {
    return this.byId.size;
  }

  byIdOrNull(id: string): Category | null {
    return this.byId.get(id) ?? null;
  }

  bySlugOrNull(slug: string): Category | null {
    return this.bySlug.get(slug) ?? null;
  }

  children(id: string | null): readonly Category[] {
    return this.childrenOf.get(id) ?? [];
  }

  /** Fil d'Ariane : de la racine jusqu'à la catégorie (vide si inconnue). */
  path(id: string): Category[] {
    const path: Category[] = [];
    for (let c = this.byId.get(id); c; c = c.parentId ? this.byId.get(c.parentId) : undefined) {
      path.unshift(c);
    }
    return path;
  }

  /** La catégorie et toutes ses descendantes (un produit d'une sous-catégorie apparaît dans ses parentes). */
  descendantIds(id: string): string[] {
    if (!this.byId.has(id)) return [];
    const ids: string[] = [];
    const stack = [id];
    while (stack.length) {
      const current = stack.pop() as string;
      ids.push(current);
      for (const child of this.children(current)) stack.push(child.id);
    }
    return ids;
  }
}

function tree(message: string): CatalogError {
  return new CatalogError("ARBORESCENCE_INVALIDE", message);
}
