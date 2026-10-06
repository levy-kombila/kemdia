import { createHash } from "node:crypto";
import { CategoryTree, createCategory, type Category } from "../domain/category.js";
import { Product } from "../domain/product.js";
import type { CategoryRepository, ProductRepository } from "../application/ports.js";

/**
 * Import du catalogue de démonstration (112 catégories, 50 produits, sans aucune donnée personnelle),
 * repris du fichier utilisé par le site depuis le S1 (`prisma/seed/catalogue-demo.json`).
 *
 * - Chaque produit de démonstration devient un produit à **une variante** (sa couleur).
 * - Identifiants **UUID stables** calculés à partir de l'adresse (UUID v5) : relancer l'import met à jour
 *   les mêmes lignes au lieu d'en créer d'autres, et la démo comme le staging ont les mêmes identifiants.
 * - Tout passe par le domaine : une donnée invalide arrête l'import avant d'écrire quoi que ce soit.
 */

export interface DemoCatalog {
  categories: {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
    icon: string;
    image: string | null;
  }[];
  products: {
    id: string;
    slug: string;
    title: string;
    description: string;
    price: number;
    oldPrice: number | null;
    brand: string | null;
    categoryId: string;
    images: string[];
    stock: number;
    rating: number;
    reviewCount: number;
    isFeatured: boolean;
    isBestseller: boolean;
    isNew: boolean;
    color: string | null;
  }[];
}

/** Espace de noms des UUID v5 de la démonstration (valeur fixe, propre à Kemdia). */
const DEMO_NAMESPACE = "6f1c2a8e-4b7d-5e3f-9a1b-2c3d4e5f6a7b";

/** UUID v5 (RFC 9562) : même nom → même identifiant, sur toutes les machines. */
export function uuidV5(name: string, namespace = DEMO_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const hash = createHash("sha1").update(ns).update(name, "utf8").digest();
  hash[6] = ((hash[6] as number) & 0x0f) | 0x50;
  hash[8] = ((hash[8] as number) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
    return uuidV5(`categorie:${slug}`);
  };

  const categories = data.categories.map((c, position) =>
    createCategory({
      id: uuidV5(`categorie:${c.slug}`),
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
      id: uuidV5(`produit:${p.slug}`),
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
          id: uuidV5(`variante:${p.slug}`),
          sku: `KMD-${createHash("sha1").update(p.slug).digest("hex").slice(0, 10).toUpperCase()}`,
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
