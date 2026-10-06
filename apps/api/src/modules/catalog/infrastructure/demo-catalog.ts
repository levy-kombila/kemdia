import { demoIds, type DemoCatalog } from "@kemdia/contracts/demo";
import { CategoryTree, createCategory, type Category } from "../domain/category.js";
import { Product } from "../domain/product.js";
import type { CategoryRepository, ProductRepository } from "../application/ports.js";

/**
 * Import du catalogue de démonstration (112 catégories, 50 produits, sans aucune donnée personnelle),
 * fourni par le paquet partagé `@kemdia/contracts/demo` (le même que le mode « fichier » du site).
 *
 * - Chaque produit de démonstration devient un produit à **une variante** (sa couleur).
 * - Identifiants **UUID stables** calculés à partir de l'adresse (UUID v5) : relancer l'import met à jour
 *   les mêmes lignes au lieu d'en créer d'autres, et la démo comme le staging ont les mêmes identifiants.
 * - Tout passe par le domaine : une donnée invalide arrête l'import avant d'écrire quoi que ce soit.
 */

export type { DemoCatalog } from "@kemdia/contracts/demo";

export interface PreparedCatalog {
  categories: Category[];
  products: { product: Product; searchText: string }[];
}

/** Transforme les données de démonstration en objets du domaine (vérifiés) — sans rien écrire. */
export function prepareDemoCatalog(data: DemoCatalog): PreparedCatalog {
  const slugOf = new Map(data.categories.map((c) => [c.id, c.slug]));
  const categoryId = (legacyId: string) => {
    const slug = slugOf.get(legacyId);
    if (!slug)
      throw new Error(`catégorie ${legacyId} introuvable dans les données de démonstration`);
    return demoIds.category(slug);
  };

  const categories = data.categories.map((c, position) =>
    createCategory({
      id: demoIds.category(c.slug),
      slug: c.slug,
      name: c.name,
      parentId: c.parentId === null ? null : categoryId(c.parentId),
      icon: c.icon,
      image: c.image,
      position,
    }),
  );
  const tree = new CategoryTree(categories); // vérifie parents, boucles, profondeur

  const products = data.products.map((p) => {
    const product = Product.create({
      id: demoIds.product(p.slug),
      slug: p.slug,
      title: p.title,
      description: p.description,
      brand: p.brand,
      categoryId: categoryId(p.categoryId),
      images: p.images,
      status: "PUBLISHED",
      rating: p.rating,
      reviewCount: p.reviewCount,
      isFeatured: p.isFeatured,
      isBestseller: p.isBestseller,
      isNew: p.isNew,
      variants: [
        {
          id: demoIds.variant(p.slug),
          sku: demoIds.sku(p.slug),
          name: p.color ?? "Standard",
          attributes: p.color ? { couleur: p.color } : {},
          price: p.price,
          compareAtPrice: p.oldPrice,
          stock: p.stock,
          isActive: true,
        },
      ],
    });
    const category = tree.byIdOrNull(product.categoryId);
    return { product, searchText: product.searchText(category?.name ?? "") };
  });
  return { categories, products };
}

/** Écrit le catalogue préparé : les parents avant les enfants, puis les produits. Peut être relancé. */
export async function importCatalog(
  prepared: PreparedCatalog,
  repositories: { categories: CategoryRepository; products: ProductRepository },
): Promise<{ categories: number; products: number }> {
  const tree = new CategoryTree(prepared.categories);
  const ordered: Category[] = [];
  const visit = (id: string | null) => {
    for (const child of tree.children(id)) {
      ordered.push(child);
      visit(child.id);
    }
  };
  visit(null);
  for (const category of ordered) await repositories.categories.save(category);
  for (const { product, searchText } of prepared.products) {
    await repositories.products.save(product, searchText);
  }
  return { categories: ordered.length, products: prepared.products.length };
}
